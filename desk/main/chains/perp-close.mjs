// MIT · Copyright (c) 2026 Nivesh Gajengi
/** F2 closes bind every builder read to the reviewed position snapshot. */
export function assertCloseSnapshot(position, input) {
  if(input.expectedSide===undefined && input.expectedNotionalUsd===undefined)return;
  if(!['long','short'].includes(input.expectedSide) || !Number.isFinite(input.expectedNotionalUsd) || input.expectedNotionalUsd<=0 ||
    position.side!==input.expectedSide || !Number.isFinite(position.notionalUsd) ||
    Math.abs(position.notionalUsd-input.expectedNotionalUsd)>Math.max(0.000001,input.expectedNotionalUsd*1e-9))
    throw Error('reviewed perp position changed; create a fresh reduce-only proposal');
}
