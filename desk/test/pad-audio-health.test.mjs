import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createHash, randomBytes } from "node:crypto";
import OpusScript from "opusscript";
import { PadLink } from "../main/padlink.mjs";
import { PadSimulatorV2 } from "../../tools/padsim/v2.mjs";
async function until(fn) {
  for(let i=0;i<300;++i) {if(fn())return;await delay(10);}
  throw Error("pad condition timeout");
}
async function lab(fn, name="ble") {
  const dir=await mkdtemp(path.join(tmpdir(),"xorr-s4-"));
  const link=new PadLink({dir});
  const pad=new PadSimulatorV2({device:"s4-unit",serial:name==="usb"});
  try {
    await pad.listen(8728);
    const socket=net.createConnection(8728,"127.0.0.1");
    const peer=link.attach(socket,name);
    await until(()=>link.pendingPairings.has(pad.device));
    link.pair(pad.pairing);
    await pad.waitFor(m=>m.type==="keymap");
    await until(()=>peer.verified && !peer.secure.pending.size);
    await fn({dir,link,pad,peer});
  } finally {link.close();await pad.close();await rm(dir,{recursive:true,force:true});}
}
test("encrypted BLE TTS uses real Opus at 24kbps with ordered tail and end",async()=>lab(async({link,pad,peer})=>{
  const pcm=Buffer.alloc(640*3+2);
  for(let i=0;i<pcm.length/2;++i)pcm.writeInt16LE(Math.round(10000*Math.sin(i*.1)),i*2);
  link.audio(peer,pcm);
  await pad.waitFor(m=>m.type==="tts" && m.end);
  const frames=pad.history.filter(m=>m.type==="tts");
  assert.equal(frames.length,5);
  const decoder=new OpusScript(16000,1,OpusScript.Application.VOIP);
  try {
    for(const [i,f] of frames.entries()) {
      assert.equal(f.codec,"opus");assert.equal(f.seq,i);assert.equal(f.sampleRate,16000);
      if(!f.end) {
        const packet=Buffer.from(f.data,"base64");assert.equal(packet.length,60);
        assert.equal(decoder.decode(packet).length,640);
      } else assert.equal(f.data,"");
    }
  } finally {decoder.delete();}
}));
test("USB retains exact PCM fallback bytes",async()=>lab(async({link,pad,peer})=>{
  const pcm=Buffer.from([0,128,255,127,1,0]);link.audio(peer,pcm);
  const frame=await pad.waitFor(m=>m.type==="tts" && m.end);
  assert.deepEqual(Buffer.from(frame.pcm,"base64"),pcm);assert.equal(frame.codec,undefined);
},"usb"));
test("BLE rejects PCM, malformed Opus, wrong rate and stream sequence",async()=>lab(async({link,peer})=>{
  const base={type:"voice",id:"voice:1",stream:"utterance",seq:0,end:true,sampleRate:16000};
  for(const m of [
    {...base,pcm:"AAAA"},
    {...base,codec:"opus",data:"@@@@"},
    {...base,codec:"opus",data:"",end:false},
    {...base,codec:"opus",data:"",sampleRate:48000},
    {...base,codec:"opus",data:"",seq:3},
  ]) {m.id="voice:"+Math.random().toString(36).slice(2);await assert.rejects(link.receive(peer,m));}
}));

const digest = b=>createHash("sha256").update(b).digest("hex");
function crashFrames(image) {
  const frames=[];
  for(let offset=0;offset<image.length;offset+=512) frames.push({
    type:"crash",dump:digest(image),size:image.length,offset,
    data:image.subarray(offset,offset+512).toString("base64"),end:offset+512>=image.length,
  });
  return frames;
}
test("encrypted crash intake checks hash, persists private bytes and binds acknowledgment",async()=>lab(async({link,pad,peer,dir})=>{
  const image=randomBytes(1025),frames=crashFrames(image);
  pad.send(frames[0]);
  await until(()=>peer.crash?.offset===512);
  assert(!pad.history.some(m=>m.type==="crash_saved"));
  for(const frame of frames.slice(1))pad.send(frame);
  const saved=await pad.waitFor(m=>m.type==="crash_saved");
  assert.equal(saved.dump,digest(image));assert.equal(saved.size,image.length);
  const file=path.join(dir,"crashes",pad.device+"-"+saved.dump+".coredump");
  assert.deepEqual(await readFile(file),image);assert.equal((await stat(file)).mode&0o777,0o600);
  assert.equal((await readdir(path.join(dir,"crashes"))).length,1);
  // A lost saved acknowledgment retransmits from zero and stays idempotent.
  const before=pad.history.filter(m=>m.type==="crash_saved").length;
  for(const frame of frames)pad.send(frame);
  await until(()=>pad.history.filter(m=>m.type==="crash_saved").length===before+1);
  assert.equal((await readdir(path.join(dir,"crashes"))).length,1);
}));
test("crash rejects gaps, changed identity, oversize and corrupt bytes without saved ack",async()=>lab(async({pad,peer,dir})=>{
  const image=randomBytes(513),frames=crashFrames(image);
  let errors=0;
  const error=async frame=>{
    const before=pad.history.length;pad.send(frame);
    await until(()=>pad.history.slice(before).some(m=>m.type==="result" && m.ok===false));++errors;
  };
  await error(frames[1]);await error({...frames[0],size:262145});
  pad.send(frames[0]);await until(()=>peer.crash?.offset===512);
  await error({...frames[1],dump:"f".repeat(64)});
  await error({...frames[1],data:Buffer.from([image[512]^1]).toString("base64")});
  assert.equal(errors,4);assert(!pad.history.some(m=>m.type==="crash_saved"));
  await assert.rejects(readdir(path.join(dir,"crashes")),{code:"ENOENT"});
}));
test("failed crash persistence never acknowledges deletion",async()=>lab(async({pad,dir})=>{
  await writeFile(path.join(dir,"crashes"),"directory creation is blocked");
  pad.send(crashFrames(randomBytes(32))[0]);
  await pad.waitFor(m=>m.type==="result" && m.ok===false);
  assert(!pad.history.some(m=>m.type==="crash_saved"));
}));
test("telemetry reaches paired desk with reset, brownout, sensor and link fields",async()=>lab(async({pad,link,peer})=>{
  const frame={type:"telemetry",uptime:30,heap:100000,psram:4000000,rssi:-61,
    temperature:null,link:"ble",fw:"2.0.0",resetReason:9,resetName:"brownout",
    resetLog:"9:brownout,",brownout:true,watchdog:true};
  pad.send(frame);await until(()=>peer.telemetry?.uptime===30);
  assert.deepEqual(link.snapshot().devices[0].telemetry,frame);
  const before=peer.telemetry;
  pad.write(JSON.stringify({...frame,v:1,uptime:99})+"\n");await delay(30);
  assert.equal(peer.telemetry,before);
}));
