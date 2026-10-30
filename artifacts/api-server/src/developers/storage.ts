/** Existing hosted callers retain their adapter. Independent runtimes MUST
 * install their dedicated adapter before importing/using developer routes. */
export type DeveloperStorage={
  initialize():Promise<void>;
  query(sql:string,params?:unknown[]):Promise<Record<string,unknown>[]>;
};
let adapter:DeveloperStorage|undefined;
let started=false;
export function configureDeveloperStorage(value:DeveloperStorage){
  if(started||adapter)throw Error("Developer storage already selected");
  adapter=value;
}
async function selected(){
  started=true;
  if(adapter)return adapter;
  if(process.env.FOUNDATION_LOCAL==="1")throw Error("Independent developer storage is required");
  const legacy=await import("../vault/store");
  return {initialize:legacy.initializeMetadata,query:legacy.query};
}
export async function initializeMetadata(){await(await selected()).initialize();}
export async function query(sql:string,params:unknown[]=[]){return(await selected()).query(sql,params);}
