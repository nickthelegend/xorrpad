# True CAD studio renders

`npm ci --prefix tools/render3d`, then `node tools/render3d/render.mjs`.
The headless three.js/Playwright scene binds only 127.0.0.1:8724, loads the real
meshopt/WebP GLB, renders five 2400×1800 stills, then 180 evenly spaced angles
into six-second, 1920×1080, 30 fps MP4 and WebM files with a poster. Every output
is in desk/app/public/media/pad, with dimensions/provenance in RENDERS.json.
These are **true renders from the real parametric CAD**, not product photographs
or generated replacement geometry. Transparent stills retain actual alpha.

The night ground is #030304, cobalt #2f5bff and lavender #b7a6ff provide studio
rims, and lime #c8f53c supplies the small glint. A shadow-receiving plane anchors
the model. Lighting uses a local RoomEnvironment; no network HDRI is required.
The turntable evaluates angle `2π * frame / 180`, excluding the duplicate endpoint,
so the step across the loop boundary is the same as every other frame.

The screen is the actual firmware ui.h and Adafruit_GFX compiled to WebAssembly,
not a JavaScript approximation. Static studio renders deliberately show its
truthful offline screen, with no invented price. Rebuild that module with
`EMSDK=/path/to/emsdk tools/uipreview/build-web-screen.sh`; GFX defaults to the
installed Arduino Adafruit_GFX_Library and can be set explicitly. The generated
56 KB JS+WASM pair is bundled offline. The hardware is **compiled, not yet flashed**.

The renderer closes its own browser and server and removes only its temporary
frame directory in a finally block. ffmpeg processes exit synchronously and
must succeed before the provenance file is written.
