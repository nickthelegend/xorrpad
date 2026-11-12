wasm3 v0.5.0, commit 6b8bcb1e07bf26ebef09a7211b0a37a446eafd52
https://github.com/wasm3/wasm3/tree/6b8bcb1e07bf26ebef09a7211b0a37a446eafd52/source
MIT, LICENSE retained. Only core interpreter source is included; no WASI/libc,
tracer, file, network, environment, clock or process bindings are linked.

Local changes (mandatory security configuration; LF/trailing whitespace normalized):
- m3_exec_defs.h: meter every next/jump dispatch edge through xorr_wasm_step.
  Includes tight loops, recursive/indirect calls and internal direct dispatch.
- m3_compile.c: memcpy 64-bit constants instead of misaligned typed accesses.
- m3_core.h: bound parser counts/names/arguments and disable tables/elements.
- m3_config.h: 4-page hard maximum and 256-slot function stack-height limit.
- m3_env.c: meter constant initializer evaluation with a valid runtime context,
  propagate initializer traps, and refuse growth above runtime memoryLimit, rather than truncating the
  backing allocation while advertising more pages.
- m3_core.c + xorr_heap.{c,h}: 768 KiB aggregate engine allocation cap, including
  parser, code, globals, tables, VM stack and linear memory. PSRAM on Arduino.

The embedding additionally restricts imports, start functions, global imports,
function/global counts, bytecode size and tick ABI; authenticates code and all
manifest limits before parsing; limits host output/calls and stages effects.
Meter units are interpreter operations (not wall-clock or source statements).
The independent 20 ms deadline is checked at each dispatch and after returning.

This version is not a formally verified sandbox. Native sanitizer/adversarial
regressions and compilation do not establish complete resistance to all engine
vulnerabilities or real hardware timing. Review upstream security fixes before
shipping third-party untrusted bytecode to production devices.
