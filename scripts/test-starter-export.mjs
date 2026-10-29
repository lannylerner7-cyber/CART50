// Run after bundling starter-archive.ts to /tmp/mainvault-archive.mjs with esbuild's .txt=text loader.
import {starterFiles,createStarterArchive} from '/tmp/mainvault-archive.mjs';
import {mkdtempSync,writeFileSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHmac,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const config={apiBase:'https://mock.invalid/api',returnUrl:'https://shop.invalid/thanks',webhookUrl:'https://shop.invalid/hooks/vault',pageName:'Test <shop>'};
const root=mkdtempSync(join(tmpdir(),'starter-check-'));
let proc;
try {
  for(const runtime of ['node','python']){
    const dir=join(root,runtime);mkdirSync(dir);
    const files=starterFiles({...config,runtime});
    assert.ok(files['.env.mainvaultwallet.example'].includes('REPLACE_WITH_SK_TEST_KEY'));
    for(const [file,text]of Object.entries(files)){const p=join(dir,file);mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,text);}
    const archive=await createStarterArchive({...config,runtime});writeFileSync(join(dir,'archive.tgz'),Buffer.from(await archive.arrayBuffer()));
    const entries=execFileSync('tar',['tzf',join(dir,'archive.tgz')],{encoding:'utf8'});
    assert.ok(entries.includes('Dockerfile')&&entries.includes('public/app.js')&&entries.includes('.env.mainvaultwallet.example'));
    if(runtime==='python'){
      execFileSync('python3',['-m','py_compile',join(dir,'server.py')]);
      writeFileSync(join(dir,'accept.py'),`
import server,uuid,json,time,hmac,hashlib
from datetime import datetime,timezone
saved=None
lost=True
class Reply:
    status_code=200
    def __init__(self,data): self.data=data
    def json(self): return self.data
def upstream(method,url,json=None,**kwargs):
    global saved,lost
    if method=="POST": saved={"id":"session1","url":"https://mock.invalid/checkout/opaque","reference":json["reference"],"amount_sats":json["amount_sats"],"environment":"simulation","status":"pending"}
    if method=="POST" and lost:
        lost=False
        raise TimeoutError("simulated lost response")
    return Reply(saved)
server.requests.request=upstream
server.requests.get=lambda *a,**kw: Reply({"price":"80000.00","time":datetime.now(timezone.utc).isoformat()})
c=server.app.test_client();headers={"Origin":"http://localhost:4588"}
assert c.get("/robots.txt").data==b"User-agent: *\\nDisallow: /\\n"
assert c.get("/api/config").headers["X-Robots-Tag"]=="noindex, nofollow, noarchive"
oid=str(uuid.uuid4());body={"id":oid,"cents":8000}
assert c.post("/api/orders",json=body,headers=headers).status_code==502
r=c.post("/api/orders",json=body,headers=headers);assert r.status_code==200,r.data
assert r.json["amount_sats"]==100000
assert c.post("/api/orders",json=body,headers=headers).json==r.json
assert c.post("/api/orders",json=dict(body,cents=9000),headers=headers).status_code==409
assert c.get("/api/orders/"+oid+"/qr").content_type=="image/png"
e={"id":str(uuid.uuid4()),"type":"checkout.simulation_paid","data":{"id":"session1","reference":oid,"amount_sats":100000,"environment":"simulation","status":"simulation_paid"}}
raw=json.dumps(e);t=str(int(time.time()));sig=hmac.new(b"disposable-signature",(t+"."+raw).encode(),hashlib.sha256).hexdigest()
h={"X-Vault-Event-Id":e["id"],"X-Vault-Signature":"t="+t+",v1="+sig}
assert c.post("/hooks/vault",data=raw,headers=h).status_code==200
assert c.post("/hooks/vault",data=raw,headers=h).status_code==200
h["X-Vault-Signature"]="t="+t+",v1="+"0"*64
assert c.post("/hooks/vault",data=raw,headers=h).status_code==401
assert c.post("/api/orders",json=body,headers={"Origin":"https://evil.invalid"}).status_code==403
print("PASS Python: create, locked amount, repeat idempotency, QR, duplicate webhook, invalid signature, origin rejection")
`);
      console.log(execFileSync('python3',['accept.py'],{cwd:dir,encoding:'utf8',env:{PATH:process.env.PATH,PYTHONPATH:'/tmp/mainvault-python-deps',MAINVAULT_API_KEY:'sk_test_disposable',MAINVAULT_WEBHOOK_SECRET:'disposable-signature',PUBLIC_ORIGIN:'http://localhost:4588'}}).trim());
      continue;
    }
    symlinkSync('/tmp/mainvault-starter-deps/node_modules',join(dir,'node_modules'),'dir');
    // Mock every upstream request. No external calls, real credentials or transfers.
    writeFileSync(join(dir,'mock.mjs'),`let saved=null,lost=true,idem=null;globalThis.fetch=async(url,opts={})=>{
      if(String(url).includes('coinbase'))return Response.json({price:'80000.00',time:new Date().toISOString()});
      if(opts.method==='POST'){if(idem&&idem!==opts.headers['Idempotency-Key'])throw Error('Idempotency changed');idem=opts.headers['Idempotency-Key'];const b=JSON.parse(opts.body);saved={id:'session1',url:'https://mock.invalid/checkout/opaque',reference:b.reference,amount_sats:b.amount_sats,environment:'simulation',status:'pending'};if(lost){lost=false;throw Error('simulated lost response');}}
      if(!saved)throw Error('missing');return Response.json(saved);
    };`);
    proc=spawn(process.execPath,['--import','./mock.mjs','server.mjs'],{cwd:dir,env:{PATH:process.env.PATH,MAINVAULT_API_KEY:'sk_test_disposable',MAINVAULT_WEBHOOK_SECRET:'disposable-signature',PUBLIC_ORIGIN:'http://localhost:4588',PORT:'4588'},stdio:'ignore'});
    for(let i=0;i<80;i++){try{if((await fetch('http://localhost:4588/api/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    const call=async(path,data,headers={})=>fetch('http://localhost:4588'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Origin:'http://localhost:4588',...headers},...(data?{body:typeof data==='string'?data:JSON.stringify(data)}:{})});
    const id=randomUUID(),body={id,cents:8000};
    assert.equal(await(await call('/robots.txt')).text(),'User-agent: *\nDisallow: /\n');
    assert.equal((await call('/api/config')).headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
    assert.equal((await call('/api/orders',body)).status,502);
    let r=await call('/api/orders',body);assert.equal(r.status,200);let order=await r.json();assert.equal(order.amount_sats,100000);assert.equal(order.status,'pending');
    assert.deepEqual(await(await call('/api/orders',body)).json(),order);
    assert.equal((await call('/api/orders',{id,cents:9000})).status,409);
    assert.equal((await call('/api/orders/'+id+'/qr')).headers.get('content-type'),'image/svg+xml');
    const event={id:randomUUID(),type:'checkout.simulation_paid',data:{id:'session1',reference:id,amount_sats:100000,environment:'simulation',status:'simulation_paid'}},raw=JSON.stringify(event);
    const t=Math.floor(Date.now()/1000),signature=createHmac('sha256','disposable-signature').update(t+'.'+raw).digest('hex');
    const h={'x-vault-event-id':event.id,'x-vault-signature':`t=${t},v1=${signature}`};
    assert.equal((await call('/hooks/vault',raw,h)).status,200);
    assert.equal((await call('/hooks/vault',raw,h)).status,200);
    assert.equal((await call('/hooks/vault',raw,{...h,'x-vault-signature':`t=${t},v1=${'0'.repeat(64)}`})).status,401);
    assert.equal((await call('/api/orders',{id:randomUUID(),cents:8000},{Origin:'https://evil.invalid'})).status,403);
    proc.kill();await new Promise(r=>proc.once('exit',r));proc=null;
    console.log('PASS Node: create, locked amount, repeat idempotency, QR, duplicate webhook, invalid signature, origin rejection');
  }
  assert.throws(()=>starterFiles({...config,runtime:'node',apiBase:'http://unsafe.invalid/api'}));
  console.log('PASS both archives: files, gzip/tar, placeholder secrets, Python syntax, unsafe export rejected');
}finally{proc?.kill();rmSync(root,{recursive:true,force:true});}
