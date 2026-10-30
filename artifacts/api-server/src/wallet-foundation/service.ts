// Independent entrypoint: no imports from owner auth, metadata, signer or RPC.
import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Ledger, LedgerError, type Principal } from "./ledger";
import {HttpError} from "../lib/security";
export const foundationStatic = express.static;
export type Access={tokenHash:string;principal:Principal;expires:number};
export function assertIsolatedEnvironment(env:NodeJS.ProcessEnv=process.env){
  if(env.FOUNDATION_LOCAL!=="1"||env.NODE_ENV==="production")throw Error("Foundation is local-only; hosted commissioning is not authorized");
  const prohibited=Object.keys(env).filter(k=>/^(VAULT_|MAINNET_|SANDBOX_|CF_|SMTP_|MARKET_|BITCOIN_|ALLOW_MAINNET$|SESSION_SECRET$|DATABASE_URL$)/.test(k));
  if(prohibited.length)throw Error("Refusing inherited custody, database or hosted credentials");
}
const bodySchema=z.object({action:z.enum(["customer","wallet","batch","fee","deposit","deposit-state","transfer","review","approve","withdrawal-state","control","event-lease","event-ack"]),data:z.record(z.string(),z.unknown())}).strict();
const id=z.string().uuid(),amount=z.number().int().nonnegative().max(2100000000000000);
const commandData:Record<string,z.ZodType>={
  customer:z.object({label:z.string().max(80).optional()}).strict(),
  wallet:z.object({customerId:id,label:z.string().max(80).optional()}).strict(),
  batch:z.object({walletId:id,count:z.number().int().min(1).max(100)}).strict(),
  fee:z.object({fixedSats:amount,bps:z.number().int().min(0).max(1000)}).strict(),
  deposit:z.object({assignmentId:id,txid:z.string().regex(/^[a-f0-9]{64}$/),vout:z.number().int().min(0).max(100000),amountSats:amount}).strict(),
  "deposit-state":z.object({id,state:z.enum(["confirmed","reversed"]),confirmations:z.number().int().min(0).optional()}).strict(),
  transfer:z.object({from:id,to:id,amountSats:amount}).strict(),
  review:z.object({walletId:id,destination:z.string().max(100),amountSats:amount,networkFeeSats:amount}).strict(),
  approve:z.object({id,approved:z.boolean()}).strict(),
  "withdrawal-state":z.object({id,state:z.enum(["unknown","broadcast","confirmed","failed"]),confirmations:z.number().int().min(0).optional(),actualFeeSats:amount.optional()}).strict(),
  control:z.object({status:z.enum(["active","frozen","suspended","revoked"]),reason:z.string().min(3).max(300),liveApproved:z.boolean().optional()}).strict(),
  "event-lease":z.object({}).strict(),
  "event-ack":z.object({id,lease:id,delivered:z.boolean()}).strict(),
};
export function foundationApp(ledger:Ledger,access:Access[],env:NodeJS.ProcessEnv=process.env,extension?:{
  setup(app:express.Express):void;
  resolve(req:express.Request):Promise<Principal>;
}){
  assertIsolatedEnvironment(env);
  const app=express();app.disable("x-powered-by");app.set("trust proxy",false);
  app.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");res.setHeader("X-Robots-Tag","noindex, nofollow, noarchive");next();});
  app.use(express.json({limit:"16kb"}));
  extension?.setup(app);
  app.get("/api/wallet-foundation/session",(_req,res)=>res.json({enabled:true,environment:"local-simulation",liveEnabled:false}));
  app.use("/api/wallet-foundation",async(req,res,next)=>{
    // Trust no forwarded identity/IP; all budgets live in the profile database.
    try{ledger.budget("ingress:"+req.socket.remoteAddress,600);}catch(e){next(e);return;}
    const token=req.get("authorization")?.replace(/^Bearer /,"")??"";
    const hash=createHash("sha256").update(token).digest("hex");
    const found=access.find(x=>timingSafeEqual(Buffer.from(hash),Buffer.from(x.tokenHash)));
    let principal:Principal;
    try{
      if(found&&found.expires>Date.now())principal=found.principal;
      else if(!found&&extension)principal=await extension.resolve(req);
      else throw new LedgerError(401,"Local profile credential missing or expired");
    }catch(e){next(e);return;}
    res.locals.principal=principal;
    try {
      // Emergency admin controls have their own budget, never tenant write quota.
      ledger.budget(principal.tenant+":"+principal.role,principal.role==="admin"?120:240);
      next();
    }catch(e){next(e);}
  });
  app.get("/api/wallet-foundation/view",(req,res)=>{
    const p=res.locals.principal as Principal;
    if(!p.scopes.includes("wallet:read")&&p.role!=="admin")throw new LedgerError(403,"Read scope required");
    const after=z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0).parse(req.query.after);
    res.json({...ledger.page(p,z.string().parse(req.query.kind),after),role:p.role,tenant:p.tenant});
  });
  app.post("/api/wallet-foundation/commands",(req,res)=>{
    const b=bodySchema.parse(req.body);
    const data=commandData[b.action].parse(b.data) as Record<string,unknown>;
    res.json(ledger.command(res.locals.principal,req.get("Idempotency-Key")??"",b.action,data));
  });
  app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    res.status(err instanceof LedgerError||err instanceof HttpError?err.status:err instanceof z.ZodError?400:503).json({error:err instanceof LedgerError||err instanceof HttpError?err.message:"Local service rejected the request"});
  });
  return app;
}
