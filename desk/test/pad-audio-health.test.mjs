import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
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
