import {createHash} from "node:crypto";
import {initializeMetadata,query} from "./storage";
import {updateAccount} from "./store";
import type {Checkout,Delivery} from "./merchant";
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
export async function archivedCheckout(accountId:string,field:"id"|"idem"|"token",value:string):Promise<Checkout|undefined>{
  await initializeMetadata();
  const clause=field==="idem"?"idem_hash=?":field==="id"?"id=?":"json_extract(data,'$.checkout.token')=?";
  const rows=await query(`SELECT data,checksum FROM developer_checkout_archive WHERE account_id=? AND ${clause}`,[accountId,field==="idem"?digest(value):value]);
  if(!rows[0])return;
  const data=String(rows[0].data);
  if(digest(data)!==rows[0].checksum)throw new Error("Archive verification failed");
  return JSON.parse(data).checkout;
}
async function copyVerified(accountId:string,c:Checkout,deliveries:Delivery[]){
  const data=JSON.stringify({checkout:c,deliveries}),checksum=digest(data);
  await query(`INSERT OR IGNORE INTO developer_checkout_archive(id,account_id,idem_hash,data,checksum)
    VALUES(?,?,?,?,?)`,[c.id,accountId,digest(c.idem),data,checksum]);
  const rows=await query("SELECT data,checksum FROM developer_checkout_archive WHERE id=? AND account_id=?",[c.id,accountId]);
  if(!rows[0]||rows[0].checksum!==checksum||String(rows[0].data)!==data)throw new Error("Archive copy did not verify");
}
// No scheduler or public API invokes this. Production pruning is deliberately
// disabled pending explicit retention/rollout approval. Copies never remove data.
export async function archiveCheckouts(accountId:string,{pruneLocal=false,now=Date.now()}={}){
  if(pruneLocal&&process.env.NODE_ENV!=="test")throw new Error("Pruning is restricted to disposable tests");
  return updateAccount(accountId,async a=>{
    const m=a.merchant;
    if(!m)return {copied:0,pruned:0};
    const cutoff=now-90*86400000;
    const candidates=m.checkouts.filter(c=>{
      const end=Math.max(Date.parse(c.expiresAt),Date.parse(c.paidAt??c.expiresAt));
      return Number.isFinite(end)&&end<cutoff&&m.deliveries.filter(d=>d.checkoutId===c.id).every(d=>d.status==="delivered");
    });
    for(const c of candidates)await copyVerified(a.id,c,m.deliveries.filter(d=>d.checkoutId===c.id));
    if(pruneLocal){
      const ids=new Set(candidates.map(c=>c.id));
      m.checkouts=m.checkouts.filter(c=>!ids.has(c.id));
      m.deliveries=m.deliveries.filter(d=>!ids.has(d.checkoutId));
    }
    return {copied:candidates.length,pruned:pruneLocal?candidates.length:0};
  });
}
