import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";

export class LedgerError extends Error {
  constructor(public status:number, message:string){super(message);}
}
const requireThat=(condition:unknown,message:string,status=409)=>{if(!condition)throw new LedgerError(status,message);};
export const digest=(x:string)=>createHash("sha256").update(x).digest("hex");
const SAT_LIMIT=2100000000000000;
function sats(n:unknown,zero=false):number{
  requireThat(Number.isSafeInteger(n)&&Number(n)>=(zero?0:1)&&Number(n)<=SAT_LIMIT,"Invalid integer satoshi amount",400);return Number(n);
}
type Data=Record<string,any>;
export type Principal={tenant:string;role:"developer"|"admin";scopes:string[];credential?:{epoch:number;hash:string}};
export class Ledger {
  readonly db:DatabaseSync;
  private credentialFenceRequired=false;
  constructor(file:string){
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS foundation_entities(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,tenant TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS foundation_page ON foundation_entities(tenant,kind,seq);
      CREATE TABLE IF NOT EXISTS foundation_postings(seq INTEGER PRIMARY KEY AUTOINCREMENT,operation TEXT NOT NULL,tenant TEXT NOT NULL,account TEXT NOT NULL,bucket TEXT NOT NULL,delta INTEGER NOT NULL,created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS foundation_balance ON foundation_postings(tenant,account,bucket);
      CREATE TABLE IF NOT EXISTS foundation_idempotency(tenant TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(tenant,key));
      CREATE TABLE IF NOT EXISTS foundation_outputs(output TEXT PRIMARY KEY,tenant TEXT NOT NULL,deposit TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS foundation_budget(subject TEXT PRIMARY KEY,window INTEGER NOT NULL,hits INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS foundation_authorization(tenant TEXT PRIMARY KEY,epoch INTEGER NOT NULL,token_hash TEXT,expires INTEGER NOT NULL,scopes TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS foundation_no_posting_update BEFORE UPDATE ON foundation_postings BEGIN SELECT RAISE(ABORT,'Immutable ledger'); END;
      CREATE TRIGGER IF NOT EXISTS foundation_no_posting_delete BEFORE DELETE ON foundation_postings BEGIN SELECT RAISE(ABORT,'Immutable ledger'); END;`);
  }
  close(){this.db.close();}
  /** Independent runtime only. Legacy deterministic ledger tests have no keys. */
  requireCredentialFence(){this.credentialFenceRequired=true;}
  /**
   * Invalidate first; identity metadata and financial state are NOT a distributed
   * transaction. An interrupted change leaves credentials disabled, never old
   * signing/reservation authority active. Epoch tombstones are never deleted.
   */
  beginCredentialChange(tenant:string):number{
    const row=this.db.prepare(`INSERT INTO foundation_authorization VALUES(?,1,NULL,0,'[]')
      ON CONFLICT(tenant) DO UPDATE SET epoch=epoch+1,token_hash=NULL,expires=0,scopes='[]'
      RETURNING epoch`).get(tenant);
    return Number(row!.epoch);
  }
  activateCredential(tenant:string,epoch:number,tokenHash:string,expires:number,scopes:string[]){
    requireThat(/^[a-f0-9]{64}$/.test(tokenHash)&&Number.isSafeInteger(epoch)&&epoch>0&&
      Number.isSafeInteger(expires)&&expires>Date.now(),"Invalid credential grant",400);
    const result=this.db.prepare(`UPDATE foundation_authorization SET token_hash=?,expires=?,scopes=?
      WHERE tenant=? AND epoch=? AND token_hash IS NULL`)
      .run(tokenHash,expires,JSON.stringify(scopes),tenant,epoch);
    requireThat(result.changes===1,"Credential change superseded; verify your passkey and retry",409);
  }
  private assertCredential(p:Principal){
    if(!this.credentialFenceRequired||p.role==="admin")return;
    const grant=this.db.prepare("SELECT epoch,token_hash,expires,scopes FROM foundation_authorization WHERE tenant=?").get(p.tenant);
    requireThat(p.credential&&grant&&grant.token_hash&&grant.epoch===p.credential.epoch&&
      grant.token_hash===p.credential.hash&&Number(grant.expires)>Date.now(),"Wallet credential expired, revoked or changing",401);
    const allowed=JSON.parse(String(grant!.scopes)) as string[];
    requireThat(p.scopes.every(s=>allowed.includes(s)),"Credential scope exceeds financial grant",403);
  }
  private row(tenant:string,id:string,kind?:string):Data {
    const r=this.db.prepare("SELECT kind,data FROM foundation_entities WHERE tenant=? AND id=?").get(tenant,id);
    requireThat(r&&(!kind||r.kind===kind),"Record not found",404);
    return JSON.parse(String(r!.data));
  }
  private put(tenant:string,kind:string,data:Data){
    data.id??=randomUUID();data.createdAt??=new Date().toISOString();
    this.db.prepare("INSERT INTO foundation_entities(id,tenant,kind,data) VALUES(?,?,?,?)").run(data.id,tenant,kind,JSON.stringify(data));return data;
  }
  private update(tenant:string,data:Data){
    this.db.prepare("UPDATE foundation_entities SET data=? WHERE tenant=? AND id=?").run(JSON.stringify(data),tenant,data.id);
  }
  private status(tenant:string){
    const r=this.db.prepare("SELECT data FROM foundation_entities WHERE tenant=? AND kind='control'").get(tenant);
    return r?JSON.parse(String(r.data)):{status:"active",liveApproved:false};
  }
  balance(tenant:string,wallet:string){
    this.row(tenant,wallet,"wallet");
    const out={available:0,pending:0,reserved:0};
    for(const r of this.db.prepare("SELECT bucket,SUM(delta) AS total FROM foundation_postings WHERE tenant=? AND account=? GROUP BY bucket").all(tenant,wallet)){
      if(String(r.bucket) in out)out[String(r.bucket) as keyof typeof out]=Number(r.total);
    }
    return out;
  }
  private post(tenant:string,op:string,lines:{account:string;bucket:string;delta:number}[]){
    requireThat(lines.reduce((s,l)=>s+BigInt(l.delta),0n)===0n,"Unbalanced journal",500);
    for(const l of lines){
      requireThat(Number.isSafeInteger(l.delta),"Unsafe journal amount",500);
      const current=Number(this.db.prepare("SELECT COALESCE(SUM(delta),0) AS n FROM foundation_postings WHERE tenant=? AND account=? AND bucket=?").get(tenant,l.account,l.bucket)?.n);
      requireThat(Number.isSafeInteger(current+l.delta)&&Math.abs(current+l.delta)<=SAT_LIMIT,"Ledger capacity exceeded");
      this.db.prepare("INSERT INTO foundation_postings(operation,tenant,account,bucket,delta,created) VALUES(?,?,?,?,?,?)").run(op,tenant,l.account,l.bucket,l.delta,new Date().toISOString());
    }
  }
  private move(tenant:string,op:string,from:string,fromBucket:string,to:string,toBucket:string,n:number){
    this.post(tenant,op,[{account:from,bucket:fromBucket,delta:-n},{account:to,bucket:toBucket,delta:n}]);
  }
  private event(tenant:string,type:string,data:Data){
    return this.put(tenant,"event",{type,payload:data,status:"pending",attempts:0,nextAt:0});
  }
  private fee(tenant:string){
    const r=this.db.prepare("SELECT data FROM foundation_entities WHERE tenant=? AND kind='fee' ORDER BY seq DESC LIMIT 1").get(tenant);
    return r?JSON.parse(String(r.data)):{version:0,fixedSats:0,bps:0};
  }
  page(p:Principal,kind:string,after=0){
    this.assertCredential(p);
    requireThat(["customer","wallet","assignment","deposit","withdrawal","transfer","event","fee","audit","usage"].includes(kind),"Invalid collection",400);
    requireThat(!["suspended","revoked"].includes(this.status(p.tenant).status)||p.role==="admin","Account suspended or revoked",401);
    const rows=this.db.prepare("SELECT seq,data FROM foundation_entities WHERE tenant=? AND kind=? AND seq>? ORDER BY seq LIMIT 51").all(p.tenant,kind,after);
    return {items:rows.slice(0,50).map(r=>{const d=JSON.parse(String(r.data));return kind==="wallet"?{...d,balance:this.balance(p.tenant,d.id)}:d;}),
      nextCursor:rows.length>50?Number(rows[49].seq):null,environment:"local-simulation",control:this.status(p.tenant),fee:this.fee(p.tenant),liveEnabled:false};
  }
  budget(subject:string,limit=120){
    const w=Math.floor(Date.now()/60000);
    const r=this.db.prepare(`INSERT INTO foundation_budget VALUES(?,?,1) ON CONFLICT(subject) DO UPDATE SET
      hits=CASE WHEN window=excluded.window THEN hits+1 ELSE 1 END,window=excluded.window RETURNING hits`).get(subject,w);
    requireThat(Number(r?.hits)<=limit,"Request budget exceeded",429);
  }
  command(p:Principal,key:string,action:string,b:Data){
    requireThat(/^[A-Za-z0-9_.:-]{8,120}$/.test(key),"Idempotency-Key required",400);
    const admin=action==="control",isReadiness=admin;
    requireThat(!admin||p.role==="admin","Admin credential required",403);
    requireThat(admin||p.role==="developer","Administrative oversight cannot move funds",403);
    requireThat(admin||p.scopes.includes("wallet:write"),"Write scope required",403);
    if(["deposit","deposit-state","withdrawal-state","event-lease","event-ack"].includes(action))
      requireThat(p.scopes.includes("wallet:simulate"),"Simulation scope required",403);
    if(action==="fee")requireThat(p.scopes.includes("wallet:fees"),"Fee-management scope required",403);
    // SQLite BEGIN IMMEDIATE serializes processes sharing this LOCAL file.
    // It is not a claim of distributed/hosted database readiness.
    this.db.exec("BEGIN IMMEDIATE");
    try{
      // Recheck AFTER obtaining the financial write lock, including idempotent
      // replays. A stale request identity cannot reserve after fence revocation.
      this.assertCredential(p);
      const fingerprint=digest(JSON.stringify({action,b})),idemTenant=p.tenant+":"+p.role;
      const old=this.db.prepare("SELECT fingerprint,result FROM foundation_idempotency WHERE tenant=? AND key=?").get(idemTenant,key);
      const state=this.status(p.tenant).status;
      requireThat(isReadiness||state==="active"||(state==="frozen"&&["deposit","deposit-state","withdrawal-state"].includes(action)),"Account writes are disabled",403);
      if(old){requireThat(old.fingerprint===fingerprint,"Idempotency key conflicts");this.db.exec("COMMIT");return JSON.parse(String(old.result));}
      const result=this.execute(p,action,b);
      this.put(p.tenant,"audit",{action,actor:p.role,operationId:result.id??null,reason:b.reason??null});
      if(!admin)this.put(p.tenant,"usage",{operation:action,operationId:result.id??null,billable:false});
      this.db.prepare("INSERT INTO foundation_idempotency VALUES(?,?,?,?)").run(idemTenant,key,fingerprint,JSON.stringify(result));
      this.db.exec("COMMIT");return result;
    }catch(e){this.db.exec("ROLLBACK");throw e;}
  }
  private execute(p:Principal,action:string,b:Data):Data{
    const t=p.tenant;
    if(action==="customer")return this.put(t,"customer",{label:String(b.label||"Customer").slice(0,80)});
    if(action==="wallet"){
      this.row(t,b.customerId,"customer");
      return this.put(t,"wallet",{customerId:b.customerId,label:String(b.label||"Wallet").slice(0,80)});
    }
    if(action==="batch"){
      this.row(t,b.walletId,"wallet");requireThat(Number.isInteger(b.count)&&b.count>=1&&b.count<=100,"Batch size must be 1–100",400);
      const batchId=randomUUID(),items=[];
      for(let i=0;i<b.count;i++){const id=randomUUID();items.push(this.put(t,"assignment",{id,batchId,walletId:b.walletId,destination:`sim:${id}`,expiresAt:new Date(Date.now()+120*3600000).toISOString(),keyDestruction:"disabled"}));}
      return {id:batchId,items,atomic:true};
    }
    if(action==="fee"){
      const fixedSats=sats(b.fixedSats,true);requireThat(fixedSats<=1000000&&Number.isInteger(b.bps)&&b.bps>=0&&b.bps<=1000,"Fee exceeds local policy",400);
      return this.put(t,"fee",{version:this.fee(t).version+1,fixedSats,bps:b.bps,mode:"added-on-top"});
    }
    if(action==="deposit"){
      const a=this.row(t,b.assignmentId,"assignment"),amount=sats(b.amountSats);
      requireThat(typeof b.txid==="string"&&/^[a-f0-9]{64}$/.test(b.txid)&&Number.isInteger(b.vout)&&b.vout>=0&&b.vout<=100000,"Invalid output identity",400);
      const output=b.txid+":"+b.vout;
      requireThat(!this.db.prepare("SELECT output FROM foundation_outputs WHERE output=?").get(output),"Output already observed");
      const d=this.put(t,"deposit",{assignmentId:a.id,walletId:a.walletId,amountSats:amount,output,status:"pending",confirmations:0,late:Date.parse(a.expiresAt)<Date.now()});
      this.db.prepare("INSERT INTO foundation_outputs VALUES(?,?,?)").run(output,t,d.id);
      this.move(t,d.id,"system:external","pending",a.walletId,"pending",amount);this.event(t,"deposit.detected",d);return d;
    }
    if(action==="deposit-state"){
      const d=this.row(t,b.id,"deposit");
      requireThat(["confirmed","reversed"].includes(b.state),"Invalid deposit state",400);
      requireThat(d.status!=="reversed","Reversed outputs require an explicit new observation/reconciliation");
      if(d.status===b.state)return d;
      if(b.state==="confirmed"){
        requireThat(Number.isInteger(b.confirmations)&&b.confirmations>=3,"Three confirmations required",400);
        this.move(t,d.id,d.walletId,"pending",d.walletId,"available",d.amountSats);d.confirmations=b.confirmations;
      }else{
        const bucket=d.status==="confirmed"?"available":"pending";
        this.move(t,d.id,d.walletId,bucket,"system:external",bucket,d.amountSats);
        // Reorg after spending may create a deficit: freeze, never hide it.
        if(this.balance(t,d.walletId).available<0)this.control(t,{status:"frozen",reason:"Deposit reversal created a deficit"}, "system");
      }
      d.status=b.state;this.update(t,d);this.event(t,"deposit."+b.state,d);return d;
    }
    if(action==="transfer"){
      this.row(t,b.from,"wallet");this.row(t,b.to,"wallet");requireThat(b.from!==b.to,"Choose distinct wallets",400);
      const n=sats(b.amountSats);requireThat(this.balance(t,b.from).available>=n,"Insufficient available balance");
      const d=this.put(t,"transfer",{from:b.from,to:b.to,amountSats:n,status:"complete"});
      this.move(t,d.id,b.from,"available",b.to,"available",n);this.event(t,"transfer.complete",d);return d;
    }
    if(action==="review"){
      this.row(t,b.walletId,"wallet");const n=sats(b.amountSats),network=sats(b.networkFeeSats,true),fee=this.fee(t);
      requireThat(network<=100000,"Fee cap exceeded",400);
      requireThat(typeof b.destination==="string"&&/^sim:[a-f0-9-]{36}$/.test(b.destination),"Use an explicit simulation destination",400);
      const developerFee=fee.fixedSats+Number((BigInt(n)*BigInt(fee.bps)+9999n)/10000n);
      const total=n+developerFee+network;requireThat(Number.isSafeInteger(total)&&total<=SAT_LIMIT,"Total too large",400);
      requireThat(this.balance(t,b.walletId).available>=total,"Insufficient available balance");
      return this.put(t,"withdrawal",{walletId:b.walletId,destination:b.destination,amountSats:n,developerFeeSats:developerFee,networkFeeSats:network,totalSats:total,feeVersion:fee.version,status:"review",expiresAt:new Date(Date.now()+120000).toISOString()});
    }
    if(action==="approve"){
      const w=this.row(t,b.id,"withdrawal");requireThat(b.approved===true,"Explicit approval required",400);
      requireThat(w.status==="review"&&Date.parse(w.expiresAt)>Date.now(),"Review expired or not approvable");
      requireThat(this.balance(t,w.walletId).available>=w.totalSats,"Insufficient available balance");
      this.move(t,w.id,w.walletId,"available",w.walletId,"reserved",w.totalSats);
      w.status="reserved";this.update(t,w);this.event(t,"withdrawal.reserved",w);return w;
    }
    if(action==="withdrawal-state"){
      const w=this.row(t,b.id,"withdrawal");
      requireThat(["unknown","broadcast","confirmed","failed"].includes(b.state),"Invalid state",400);
      requireThat(!["confirmed","failed"].includes(w.status),"Withdrawal is terminal");
      if(b.state==="failed"){
        requireThat(w.status==="reserved"&&!w.txid,"Cannot release potentially broadcast funds");
        this.move(t,w.id,w.walletId,"reserved",w.walletId,"available",w.totalSats);
      }else if(b.state==="unknown"||b.state==="broadcast"){
        requireThat(["reserved","unknown","broadcast"].includes(w.status),"Approval/reservation required");
        requireThat(w.status!=="reserved"||this.status(t).status==="active","New signing is paused");
        // A deterministic LOCAL stand-in is persisted BEFORE a broadcast observation.
        // No signing/RPC library or private key exists in this service.
        w.signedArtifact??="simulation:"+digest(w.id+":"+w.destination+":"+w.totalSats);
        w.txid??=digest(w.signedArtifact);
      }else{
        requireThat(w.status==="broadcast"&&Number.isInteger(b.confirmations)&&b.confirmations>=3,"Broadcast and three confirmations required");
        const actual=sats(b.actualFeeSats,true);requireThat(actual<=w.networkFeeSats,"Actual fee exceeds approval");
        this.post(t,w.id,[
          {account:w.walletId,bucket:"reserved",delta:-w.totalSats},
          {account:"system:recipient",bucket:"settled",delta:w.amountSats},
          {account:"system:developer-fees",bucket:"earned",delta:w.developerFeeSats},
          {account:"system:network",bucket:"settled",delta:actual},
          {account:w.walletId,bucket:"available",delta:w.networkFeeSats-actual},
        ]);
        w.actualFeeSats=actual;w.confirmations=b.confirmations;
      }
      w.status=b.state;this.update(t,w);this.event(t,"withdrawal."+b.state,w);return w;
    }
    if(action==="control"){return this.control(t,b,p.role);}
    if(action==="event-lease"){
      const row=this.db.prepare("SELECT data FROM foundation_entities WHERE tenant=? AND kind='event' AND json_extract(data,'$.status')!='delivered' AND json_extract(data,'$.nextAt')<=? ORDER BY seq LIMIT 1").get(t,Date.now());
      if(!row)return {idle:true};
      const e=JSON.parse(String(row.data));e.lease=randomUUID();e.status="sending";e.nextAt=Date.now()+60000;e.attempts++;
      this.update(t,e);return e;
    }
    if(action==="event-ack"){
      const e=this.row(t,b.id,"event");requireThat(e.status==="sending"&&e.lease===b.lease&&e.nextAt>Date.now(),"Lease expired or replaced");
      requireThat(typeof b.delivered==="boolean","Delivery result required",400);
      e.status=b.delivered?"delivered":"failed";e.nextAt=Date.now()+Math.min(3600000,1000*2**Math.min(e.attempts,12));delete e.lease;
      this.update(t,e);return e;
    }
    throw new LedgerError(404,"Unknown operation");
  }
  private control(t:string,b:Data,actor:string){
    requireThat(["active","frozen","suspended","revoked"].includes(b.status)&&typeof b.reason==="string"&&b.reason.trim().length>=3,"Status and audit reason required",400);
    const row=this.db.prepare("SELECT data FROM foundation_entities WHERE tenant=? AND kind='control'").get(t);
    requireThat(!row||JSON.parse(String(row.data)).status!=="revoked"||b.status==="revoked","Revoked credentials cannot be reactivated");
    const d={...(row?JSON.parse(String(row.data)):{}),status:b.status,liveApproved:b.liveApproved===true,liveEnabled:false,reason:b.reason,actor};
    if(d.id)this.update(t,d);else this.put(t,"control",d);
    this.put(t,"audit",{action:"control",actor,reason:b.reason,status:b.status});return d;
  }
}
