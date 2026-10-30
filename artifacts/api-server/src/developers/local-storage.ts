import {DatabaseSync,type SQLInputValue} from "node:sqlite";
import {chmodSync} from "node:fs";
import {metadataSchema} from "../vault/schema";
import type {DeveloperStorage} from "./storage";
/** Local commissioning only. Reuses code-defined schema, never owner tables. */
export function localDeveloperStorage(file:string):DeveloperStorage&{close():void}{
  const db=new DatabaseSync(file);chmodSync(file,0o600);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
  let ready=false;
  return {
    async initialize(){
      if(ready)return;
      db.exec("BEGIN IMMEDIATE");
      try{
        for(const table of metadataSchema.filter(t=>t.name.startsWith("developer_"))){
          db.exec(table.create);
          const columns=db.prepare(`PRAGMA table_info("${table.name}")`).all();
          for(const c of table.columns)if(!columns.some(x=>x.name===c.name))throw Error("Developer schema requires an approved migration");
        }
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS developer_archive_idem ON developer_checkout_archive(account_id,idem_hash)");
        db.exec("COMMIT");ready=true;
      }catch(e){db.exec("ROLLBACK");throw e;}
    },
    async query(sql,params=[]){
      if(/\b(vault_state|prices|replica_health|vault_schema_migrations)\b/i.test(sql))throw Error("Owner metadata is outside the developer boundary");
      return db.prepare(sql).all(...params as SQLInputValue[]) as Record<string,unknown>[];
    },
    close(){db.close();}
  };
}
