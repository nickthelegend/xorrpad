// MIT · Copyright (c) 2026 Nivesh Gajengi
export const DEFAULT_TILT = Object.freeze({dailyLossUsd:0,maxTradesHour:0,losingCloses:0,cooldownMinutes:15});
export function validateTilt(value) {
 if(!value || Object.keys(value).sort().join(',')!==Object.keys(DEFAULT_TILT).sort().join(',') ||
  !Number.isFinite(value.dailyLossUsd) || value.dailyLossUsd<0 || value.dailyLossUsd>1e9 ||
  !Number.isInteger(value.maxTradesHour) || value.maxTradesHour<0 || value.maxTradesHour>1000 ||
  !Number.isInteger(value.losingCloses) || value.losingCloses<0 || value.losingCloses>1000 ||
  !Number.isInteger(value.cooldownMinutes) || value.cooldownMinutes<1 || value.cooldownMinutes>10080)throw Error('invalid tilt guard settings');
 return {...value};
}
export function tiltState(message) {
 if(typeof message.blocked!=='boolean' || typeof message.healthy!=='boolean' || typeof message.clockReady!=='boolean' ||
  typeof message.reason!=='string' || message.reason.length>96 ||
  !['remainingSeconds','durationSeconds','tradesHour','losingCloses','unknownCloses'].every(k=>Number.isSafeInteger(message[k]) && message[k]>=0) ||
  !Number.isFinite(message.realizedPnlUsd))throw Error('invalid pad tilt state');
 const {blocked,reason,remainingSeconds,durationSeconds,tradesHour,realizedPnlUsd,losingCloses,clockReady,healthy,unknownCloses}=message;
 return {blocked,reason,remainingSeconds,durationSeconds,tradesHour,realizedPnlUsd,losingCloses,clockReady,healthy,unknownCloses,settings:validateTilt(message.settings),observedAt:new Date().toISOString()};
}
export function tiltReceipt(receipt,signal,firmware) {
 if(!(Number((firmware || "").split(".")[0])>=4))return {...receipt};
 return {...receipt,closed:receipt.closed===true || signal?.reduceOnly===true || (signal?.kind==='spot' && signal?.side==='SELL'),
  realizedPnlUsd:Number.isFinite(receipt.realizedPnlUsd)?receipt.realizedPnlUsd:null};
}
