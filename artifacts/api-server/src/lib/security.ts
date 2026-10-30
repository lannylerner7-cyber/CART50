// Shared HTTP/cryptographic primitives. No custody or storage imports.
import {createHash,timingSafeEqual} from "node:crypto";
import type {Request,Response,NextFunction} from "express";
export class HttpError extends Error {
  constructor(public status:number,message:string){super(message);}
}
export const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export function equal(a:string,b:string){
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
}
export function credentialHash(value:string){
  if(!/^[A-Za-z0-9_-]{86}$/.test(value))throw new HttpError(400,"Use the 86-character credential from your new offline keyfile");
  const bytes=Buffer.from(value,"base64url");
  if(bytes.length!==64||bytes.toString("base64url")!==value)throw new HttpError(400,"Invalid keyfile encoding");
  return createHash("sha256").update(bytes).digest("hex");
}
export function cookie(req:Request,name:string){
  return req.headers.cookie?.split(";").map(v=>v.trim()).find(v=>v.startsWith(name+"="))?.slice(name.length+1);
}
export function expectedOrigin(req:Request){
  if(process.env.PUBLIC_ORIGIN)return new URL(process.env.PUBLIC_ORIGIN).origin;
  if(process.env.NODE_ENV==="production")throw new HttpError(503,"PUBLIC_ORIGIN must be configured");
  return `https://${req.get("host")}`;
}
export function verifyOrigin(req:Request,_res:Response,next:NextFunction){
  if(["GET","HEAD","OPTIONS"].includes(req.method)){next();return;}
  if(!req.get("origin")||req.get("origin")!==expectedOrigin(req))throw new HttpError(403,"Request origin rejected");
  if(!req.is("application/json")&&Number(req.get("content-length")||0)>0)throw new HttpError(415,"JSON required");
  next();
}
