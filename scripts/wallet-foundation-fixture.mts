// Disposable, opt-in independent developer service. Never imports the owner app.
import { randomBytes, createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
if(process.env.FOUNDATION_LOCAL!=="1")throw Error("Requires FOUNDATION_LOCAL=1");
// Discard inherited credentials, not just their values in logging.
for(const k of Object.keys(process.env))if(!["PATH","HOME","TMPDIR","FOUNDATION_LOCAL"].includes(k))delete process.env[k];
process.env.NODE_ENV="development";
const {assertIsolatedEnvironment,foundationApp,foundationStatic}=await import("../artifacts/api-server/src/wallet-foundation/service");
assertIsolatedEnvironment();
const {Ledger}=await import("../artifacts/api-server/src/wallet-foundation/ledger");
const dir=mkdtempSync(join(tmpdir(),"foundation-local-")),ledger=new Ledger(join(dir,"developer-ledger.sqlite"));
const access=[],credentials:Record<string,string>={};
for(const [name,tenant,role]of [["developerA","tenant-a","developer"],["developerB","tenant-b","developer"],["adminA","tenant-a","admin"]] as const){
  const token=randomBytes(32).toString("base64url");credentials[name]=token;
  access.push({tokenHash:createHash("sha256").update(token).digest("hex"),principal:{tenant,role,scopes:role==="developer"?["wallet:read","wallet:write","wallet:simulate","wallet:fees"]:["wallet:read"]},expires:Date.now()+1800000});
}
const credentialPath=join(dir,"local-credentials.json");writeFileSync(credentialPath,JSON.stringify(credentials),{mode:0o600});
const app=foundationApp(ledger,access);
const staticDir=fileURLToPath(new URL("../artifacts/bitcoin-vault/dist/public",import.meta.url));
app.use(foundationStatic(staticDir));
app.get("/developers/wallet-foundation",(_req,res)=>res.sendFile(join(staticDir,"index.html")));
const server=app.listen(4401,"127.0.0.1",()=>console.log(`Isolated developer service http://localhost:4401/developers/wallet-foundation; disposable credentials file: ${credentialPath}`));
for(const sig of ["SIGTERM","SIGINT"] as const)process.once(sig,()=>{server.closeAllConnections();server.close(()=>{ledger.close();rmSync(dir,{recursive:true,force:true});process.exit(0);});});
