#!/usr/bin/env node
import {SerialPort} from '../desk/node_modules/serialport/dist/index.js';
import {Lines} from '../desk/main/padlink.mjs';
import {checkCRC,verifyHandshake} from '../desk/main/pad-v2.mjs';
const [port,expected]=process.argv.slice(2);if(!port)throw Error('Serial port required');
const serial=new SerialPort({path:port,baudRate:115200});
const timer=setTimeout(()=>{console.error(`FAIL ${expected||'unknown-unit'}: factory report timed out`);serial.close();process.exitCode=1;},240000);
const lines=new Lines(m=>{
 if(m.type!=='factory_result')return;
 try{const report=checkCRC(m);if(!verifyHandshake(report.payload,report.signature,report.pk))throw Error('invalid factory signature');const r=JSON.parse(report.payload);if(expected&&r.serial!==expected)throw Error('serial number mismatch');
  const checks=['keys','knob','mic','speaker','tft','led','wifi','ble'];for(const k of checks)console.log(`${r[k]===true?'PASS':'FAIL'} ${r.serial} ${k}`);const pass=r.pass===true&&checks.every(k=>r[k]===true);console.log(`${pass?'PASS':'FAIL'} ${r.serial}`);process.exitCode=pass?0:1;
 }catch(e){console.error(`FAIL ${expected||'unknown-unit'}: ${e.message}`);process.exitCode=1;}finally{clearTimeout(timer);serial.close();}
});
serial.on('data',b=>{try{lines.feed(b);}catch{}});serial.on('error',e=>{clearTimeout(timer);console.error(e.message);process.exitCode=1;});
