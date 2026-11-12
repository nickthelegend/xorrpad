# Brand art prompts and provenance

Mode: ChatGPT built-in `image_gen`, true transparent-background generation for
15 isolated objects, then a reference-image OG composition. No CLI/API fallback
or API key was used. Final assets: `desk/app/public/media/art/` (ASSETS.json lists
actual dimensions and byte sizes). The inspected full contact sheet is
`docs/screens/v2/art-contact.jpg`.

Every prompt used this style line:

> glossy premium 3D, soft studio light, xorr.finance palette (night #030304,
> lime #c8f53c, cobalt #2f5bff, lavender #b7a6ff, mint #0dd87e), matches glossy
> 3D coin art; no text, no logos, no real brands

Shared square-asset framing: stylized-concept; single 1024×1024 transparent PNG;
one isolated centered object, generous transparent margins; lime highlights,
cobalt/lavender edge lights; true alpha, no background plane, no watermark,
no pad or product device. Functional radio symbols are abstract glyphs.

| File                | Subject prompt                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| voice.png           | A glowing waveform orb: dark translucent sphere containing luminous lime waveform bars.                 |
| auto.png            | A sculpted glossy shield with an inset luminous check mark.                                             |
| signals.png         | A circular radar instrument with one bright ping and concentric glossy rings.                           |
| hedge.png           | Two blank circular yes/no outcome tokens balanced on a graceful balance beam; tokens have no lettering. |
| pulse.png           | A luminous heartbeat line inset on a dark transparent glass tile.                                       |
| discipline.png      | A glossy sculpted hourglass with a small integrated lock.                                               |
| backtest.png        | A single abstract cobalt keycap with a lavender rewind arc curling around it.                           |
| brief.png           | An abstract sunrise disc behind a small elegant speaker.                                                |
| empty-pad.png       | A floating disconnected USB-C cable, curved gracefully, both connectors clearly visible, no device.     |
| empty-chats.png     | Two empty rounded glossy speech bubbles, no marks or text.                                              |
| empty-positions.png | An open empty portfolio tray with no coins.                                                             |
| empty-keeper.png    | An empty orbital frame with a small inactive clock disc, no numbers.                                    |
| usb.png             | A premium USB-C connector as one sculptural object.                                                     |
| bluetooth.png       | A glossy sculpted Bluetooth radio rune standing as a small 3D object, no lettering.                     |
| wifi.png            | A glossy sculpted Wi-Fi radio wave symbol as one premium 3D object.                                     |

OG prompt, using the step-2 `hero-34.png` as its image reference:

> Compositing, 1536×1024 OG card. Use the supplied TRUE CAD render as the exact
> product image reference. Preserve this pad's precise geometry: cobalt-blue
> tall enclosure, slanted rear display pod, knob at rear left, fourteen keycaps
> at their existing positions and original white/black/pink/red/blue/purple
> materials. Do not invent another device or change its shape or key count.
> Compose this exact device centrally on a night #030304 studio backdrop with
> restrained soft cobalt #2f5bff and lavender #b7a6ff rim light, a tiny lime
> #c8f53c glint, mint #0dd87e accents and a contact shadow. Glossy premium 3D,
> soft studio light, matches glossy 3D coin art. No added objects, no text, no
> logos, no real brands. The LCD should be dark unlettered glass. No typography
> or captions anywhere. 1536×1024 landscape composition.

The OG is generated art **referenced to** the true CAD render; the files in
media/pad are deterministic three.js renders of that CAD. They are not labelled
as photographs. Generated icons never substitute for the actual pad geometry.

Inspected all 16 images: no text, unwanted brands or visible generation defects;
the palette and the OG's 14-key CAD identity are retained. The first concurrent
Auto-accept generation returned no asset; it was regenerated successfully.
Alpha assets were resized to 1024 and optimized with pngquant (256 colours,
quality 0–85); OG is WebP quality 86. Every final asset is below 400 KB.
