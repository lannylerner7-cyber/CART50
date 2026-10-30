import {randomBytes} from "node:crypto";
import {z} from "zod";
import {foundationApp,type Access} from "./service";
import {Ledger} from "./ledger";
import {configureDeveloperStorage,type DeveloperStorage} from "../developers/storage";
import {developerRouter,type DeveloperDependencies} from "../developers/routes";
import {developerLimits} from "../developers/limits";
import {sharedBudget} from "../developers/limits";
import {accountBy,updateAccount,audit} from "../developers/store";
import {identify,activeSession} from "../developers/auth";
import {eligible} from "../developers/merchant";
import {hash,equal,HttpError,verifyOrigin} from "../lib/security";

const scopes=z.array(z.enum(["wallet:read","wallet:write","wallet:fees","wallet:simulate"])).min(1).max(4);
/** No owner router or combined application is imported or mounted. */
export function independentDeveloperRuntime(options:{
  ledger:Ledger;storage:DeveloperStorage;adminAccess:Access[];
  providers:Required<DeveloperDependencies>;env:NodeJS.ProcessEnv;
}){
  if(options.adminAccess.some(a=>a.principal.role!=="admin"))throw Error("Developer credentials must resolve through independent account metadata");
  configureDeveloperStorage(options.storage);
  return foundationApp(options.ledger,options.adminAccess,options.env,{
    setup(app){
      app.use("/api",developerLimits);
      app.use("/api/developers",developerRouter(options.providers));
      app.post("/api/developer-wallet/key",verifyOrigin,async(req,res)=>{
        const {a,s}=await identify(req,true);
        await sharedBudget("wallet-key-management",a.id,10,res);
        const input=z.object({scopes,revoke:z.boolean().optional()}).strict().parse(req.body);
        const secret=randomBytes(32).toString("base64url");
        await updateAccount(a.id,current=>{
          activeSession(current,s);eligible(current,true);
          const session=current.sessions.find(x=>x.hash===s.hash)!;
          if(!session.passkeyAt||Date.now()-session.passkeyAt>300000)throw new HttpError(403,"Verify your passkey again before changing API credentials");
          if(input.revoke)delete current.walletApiKey;
          else current.walletApiKey={hash:hash(secret),scopes:[...new Set(input.scopes)],expiresAt:Date.now()+30*86400000,version:(current.walletApiKey?.version??0)+1};
          delete session.passkeyAt;
          audit(current,input.revoke?"wallet-api-key-revoked":"wallet-api-key-rotated");
        });
        res.json({key:input.revoke?null:`wv_test_${a.id}.${secret}`,revoked:!!input.revoke});
      });
    },
    async resolve(req){
      const match=/^Bearer wv_test_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(req.get("authorization")??"");
      if(!match)throw new HttpError(401,"Independent wallet API credential required");
      const a=await accountBy("id",match[1]);
      if(!a||!a.walletApiKey||a.walletApiKey.expiresAt<=Date.now()||!equal(a.walletApiKey.hash,hash(match[2])))throw new HttpError(401,"Wallet API key expired or revoked");
      if(a.merchant?.status==="suspended")throw new HttpError(401,"Developer access suspended");
      eligible(a,req.method!=="GET");
      return {tenant:a.id,role:"developer",scopes:a.walletApiKey.scopes};
    }
  });
}
