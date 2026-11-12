// Raw UTF-8 data segment; no managed strings cross the ABI.
@external("xorr", "widget") declare function widget(ptr: usize, len: i32): i32;
const text: usize = memory.data<u8>([77,121,32,97,98,105,108,105,116,121]);
export function tick(seconds: i32): void { widget(text, 10); }
