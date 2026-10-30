// Invoked only by the local test suite with a temporary database and review ID.
import {Ledger} from "./ledger";
const [file,id,key]=process.argv.slice(2);
const l=new Ledger(file);
try{
  l.command({tenant:"a",role:"developer",scopes:["wallet:write"]},key,"approve",{id,approved:true});
  process.stdout.write("reserved");
}catch{process.stdout.write("rejected");}finally{l.close();}
