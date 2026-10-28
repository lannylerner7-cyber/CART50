import {test} from "node:test";
import assert from "node:assert/strict";
import {randomBytes,createHash,createDecipheriv} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,copyFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("local encrypted webhook backup needs the original configuration key; never hosted evidence",async()=>{
  process.env.SESSION_SECRET=randomBytes(48).toString("base64url");
  const original=process.env.SESSION_SECRET;
  const {seal}=await import("./webhooks");
  const dir=mkdtempSync(join(tmpdir(),"webhook-backup-"));
  const secret=randomBytes(32).toString("base64url");
  try{
    const db=new DatabaseSync(join(dir,"source.sqlite"));
    db.exec("CREATE TABLE fixture_backup(data TEXT NOT NULL)");
    db.prepare("INSERT INTO fixture_backup VALUES(?)").run(seal(secret));db.close();
    copyFileSync(join(dir,"source.sqlite"),join(dir,"restored.sqlite"));
    const restored=new DatabaseSync(join(dir,"restored.sqlite"));
    const encrypted=String(restored.prepare("SELECT data FROM fixture_backup").get()!.data);restored.close();
    assert.ok(!encrypted.includes(secret));
    const recover=(configurationKey:string)=>{
      const [iv,tag,body]=encrypted.split(".").map(s=>Buffer.from(s,"base64url"));
      const key=createHash("sha256").update("developer-webhooks:"+configurationKey).digest();
      const decipher=createDecipheriv("aes-256-gcm",key,iv);decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body),decipher.final()]).toString();
    };
    assert.equal(recover(original),secret);
    assert.throws(()=>recover(randomBytes(48).toString("base64url")));
    assert.equal(recover(original),secret,"restoring original configuration recovers pending secrets");
  }finally{rmSync(dir,{recursive:true,force:true});}
});
