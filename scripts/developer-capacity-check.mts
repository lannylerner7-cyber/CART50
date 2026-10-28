// Synthetic local SQLite sizing only: never connects to hosted storage.
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
const db=new DatabaseSync(":memory:");
db.exec("CREATE TABLE developer_accounts(id TEXT PRIMARY KEY,data TEXT NOT NULL)");
const now=new Date().toISOString();
function sample(checkouts:number,audit:number){
  return JSON.stringify({id:"fixture",merchant:{
    checkouts:Array.from({length:checkouts},(_,i)=>({id:String(i),token:"x".repeat(80),amount_sats:25000,reference:"x".repeat(100),returnUrl:"https://example.test/"+"x".repeat(980),origin:"https://example.test",expiresAt:now,idem:"x".repeat(100),fingerprint:"x".repeat(64)})),
    deliveries:Array.from({length:checkouts},(_,i)=>({eventId:String(i),checkoutId:String(i),status:"delivered",attempts:1,url:"https://example.test/"+"x".repeat(980),secret:"x".repeat(120),body:"x".repeat(400),nextAt:0})),
    audit:Array.from({length:audit},()=>({at:now,action:"settings",reason:"x".repeat(300),actor:"developer"})),
  }});
}
const typical=sample(5,20),boundary=sample(500,2000);
const insert=db.prepare("INSERT INTO developer_accounts VALUES(?,?)");
for(let i=0;i<500;i++)insert.run(String(i).padStart(6,"0"),typical);
function measure(sql:string){
 const stmt=db.prepare(sql),times:number[]=[];let bytes=0;
 for(let i=0;i<50;i++){const t=performance.now();const rows=stmt.all();bytes=Buffer.byteLength(JSON.stringify(rows));for(const r of rows)JSON.parse(String(r.data));times.push(performance.now()-t);}
 times.sort((a,b)=>a-b);return {rowsBytes:bytes,p50Ms:+times[25].toFixed(2),p95Ms:+times[47].toFixed(2)};
}
console.log(JSON.stringify({evidence:"Synthetic in-memory SQLite, not hosted D1 or HTTP load test",accounts:500,
 typicalAccountBytes:Buffer.byteLength(typical),boundaryAccountBytes:Buffer.byteLength(boundary),
 current:measure("SELECT data FROM developer_accounts ORDER BY id LIMIT 501"),
 proposedCursorPage:measure("SELECT data FROM developer_accounts WHERE id>'000099' ORDER BY id LIMIT 51")},null,2));
db.close();
