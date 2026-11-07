import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyMailError} from "./mail-diagnostics";

test("mail errors are classified only by allowlisted codes, never raw text",()=>{
  for(const [code,expected] of Object.entries({EAUTH:"authentication",ETIMEDOUT:"timeout",ECONNECTION:"connection",EDNS:"connection",ETLS:"tls",CERT_HAS_EXPIRED:"tls",EENVELOPE:"rejected",EMESSAGE:"provider",ESOCKET:"unknown"})){
    assert.equal(classifyMailError({code,message:"secret verification code",response:"private SMTP response"}),expected);
  }
  for(const error of [null,undefined,"secret",{code:"secret"},{message:"EAUTH password=secret"}]){
    assert.equal(classifyMailError(error),"unknown");
  }
});
