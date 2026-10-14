import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { performance } from "node:perf_hooks";
import { admission } from "../middlewares/admission";
import { ReadFlight } from "./read-flight";

test("10,000 local HTTP requests: bounded admission, coalesced reads, explicit overload", async () => {
  const app = express();
  const flight = new ReadFlight<{ value: number }>();
  let active = 0, peak = 0, upstream = 0;
  app.use(admission(128));
  app.get("/fixture", async (_req,res) => {
    active++; peak = Math.max(peak,active);
    try {
      const data = await flight.read(async () => {
        upstream++;
        await new Promise(r=>setTimeout(r,30));
        return { value: 1 };
      });
      res.json(data);
    } finally { active--; }
  });
  const server = app.listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  const address = server.address();
  assert.ok(address && typeof address!=="string");
  const base = `http://127.0.0.1:${address.port}/fixture`;
  let assigned=0, ok=0, busy=0;
  const latencies:number[]=[];
  const started=performance.now();
  try {
    await Promise.all(Array.from({length:256},async ()=>{
      while(assigned++ < 10000) {
        const begin=performance.now();
        const response=await fetch(base);
        await response.json();
        latencies.push(performance.now()-begin);
        if(response.status===200) ok++;
        else {
          assert.equal(response.status,503);
          assert.equal(response.headers.get("retry-after"),"1");
          busy++;
        }
      }
    }));
    latencies.sort((a,b)=>a-b);
    assert.equal(ok+busy,10000);
    assert.ok(ok>0);
    assert.ok(busy>0);
    assert.ok(peak<=128);
    assert.ok(upstream<ok);
    console.log(JSON.stringify({scope:"local HTTP admission/read-coalescing fixture, NOT production or Bitcoin TPS",
      total:ok+busy,concurrency:256,ok,busy,peak,upstreamReads:upstream,
      durationMs:Math.round(performance.now()-started),
      p95Ms:Math.round(latencies[Math.floor(latencies.length*0.95)]),
      rssMiB:Math.round(process.memoryUsage().rss/1048576)}));
    assert.equal((await fetch(base)).status,200,"service recovers after burst");
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
