import type {Request,Response,NextFunction} from "express";
import {createHash} from "node:crypto";
import {initializeMetadata,query} from "./storage";
import {HttpError} from "../lib/security";

export const BUDGET_SQL=`INSERT INTO developer_rate_limits(id,window,hits)
    VALUES(?,CAST(strftime('%s','now') AS INTEGER)/60,1)
    ON CONFLICT(id) DO UPDATE SET
      window=excluded.window,
      hits=CASE WHEN developer_rate_limits.window=excluded.window THEN developer_rate_limits.hits+1 ELSE 1 END
    WHERE developer_rate_limits.window!=excluded.window OR developer_rate_limits.hits<?
    RETURNING hits`;
export async function sharedBudget(scope:string,identity:string,limit:number,res?:Response){
  await initializeMetadata();
  const key=createHash("sha256").update(scope+":"+identity).digest("hex");
  const rows=await query(BUDGET_SQL,[key,limit]);
  if(!rows.length){res?.setHeader("Retry-After","60");throw new HttpError(429,"Request budget exhausted. Wait up to one minute.");}
}
let cleanupAt=0;
export async function developerLimits(req:Request,res:Response,next:NextFunction){
  if(req.path==="/developers/logout"){next();return;}
  if(!/^\/(developers|developer-console|developer-wallet|checkout|v1\/checkout)(\/|$)/.test(req.path)){next();return;}
  res.setHeader("Cache-Control","no-store");
  try{
    // req.ip uses the existing explicit trusted-proxy CIDR configuration.
    // Never read caller-supplied X-Forwarded-For directly.
    await sharedBudget("ingress","global",1200,res);
    const kind=req.method==="GET"?"read":"write";
    await sharedBudget(kind,req.ip??req.socket.remoteAddress??"unknown",kind==="read"?180:60,res);
    if(req.method==="POST" && /^\/developers\/(register|resend|verify-email|login|passkey-login-options|passkey-login-verify)$/.test(req.path)){
      await sharedBudget("endpoint:"+req.path,req.ip??"unknown",20,res);
    }
    if(Date.now()>cleanupAt){
      cleanupAt=Date.now()+60000;
      await query(`DELETE FROM developer_rate_limits WHERE id IN
        (SELECT id FROM developer_rate_limits WHERE window<CAST(strftime('%s','now') AS INTEGER)/60-2 LIMIT 5000)`);
    }
    next();
  }catch(e){next(e);}
}
