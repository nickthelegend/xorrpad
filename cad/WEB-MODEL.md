# Real CAD web export

Run `python3 -m venv cad/.venv`, then `cad/.venv/bin/pip install -r cad/requirements.txt`;
`npm ci --prefix tools/render3d`; `cad/.venv/bin/python cad/assembly.py`;
`cad/.venv/bin/python cad/export_web_glb.py`; `node tools/render3d/validate.mjs`.

Both sub-2 MB GLBs pass Khronos gltf-validator with zero errors and zero warnings;
see WEB-MODEL-VALIDATION.json. Meshopt compression is applied last, after WebP
texture compression, so the CLI cannot inadvertently decode the final mesh.
Both EXT_meshopt_compression and EXT_texture_webp are present.

The geometry is generated directly from assembly.build_groups() and the actual
2.8-inch display Pod. No replacement enclosure/key shapes are invented. CAD is
millimetres, X right, Y back, Z up. The current parametric CAD uses 1u MIC; the
prototype photo shows an earlier wide cap. This exporter preserves the supplied
CAD rather than changing its print geometry to disguise that version difference.

Materials are matched by physical position in docs/pad.jpg: the rear DCA/Grid/
Momentum caps are black/purple/black, the next Rebalance/Yield/Risk/Base row is
black/red/blue/black, Buy is pink and the remaining front caps are warm white.
The enclosure and display pod use rough cobalt-blue PLA, the plate a dark PCB
finish, the legends dark infill and the display a dark bezel. Filament colours
are visual estimates from the lit prototype photo, not measured colour samples.

key-01…key-14 follow the desk's canonical physical slot ACTIONS order, with the
original CAD positions retained. Each is a parent with a cap and legend; knob
also has a real local pivot, so rotation does not orbit the whole model. Screen
is a separate emissive UV-mapped mesh under the node named screen; its glass
lies in the display pod's actual active-area plane. Viewers replace its placeholder
texture with live firmware pixels. Assembled/exploded files share the geometry;
exploded group offsets preserve assembly.py's lifts and lift the display 65 mm.

The finishing pass adds geometry-derived vertex AO, a baked contact footprint,
and KHR_materials_clearcoat. See models/QUALITY.json and tools/render3d/README.md.
