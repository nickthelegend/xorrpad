# XOR Desktop v2 design contract

The authoritative world is xorr.finance, not v1. Source was read directly from
landing/src/app/globals.css, layout.tsx, the three motion components, Card,
Badge, Icon and OrbitCta/KeysStack/AgentShuffle/RuleTracks. The public site was
also requested; the browsing gateway could not retrieve it, so the supplied
local implementation is the visual authority. No brand decision is reopened.

## Measured reference takes

- w27: the product occupies about half the width, with large left-hand display
  type and generous dark negative space. Use that confidence for Device, with
  the actual 14-key geometry as the visual focus. Do not copy its art or copy.
- w146: luminous imagery is restrained inside a black field. Keep just one low
  intensity cobalt-to-lavender light behind the device, not glass over all UI.
- w64: the chart occupies roughly two thirds of the trading workspace and the
  ticket stays at its right. This density belongs only to Markets.
- docs/pad.jpg: the real prototype has the TFT, knob and 3/3/4/4 key rows. The
  CSS enclosure is an interactive representation, not a manufacturing claim.

## System

Night #030304; ink #f3f0e8; lime #c8f53c; mint #0dd87e; cobalt #2f5bff;
lavender #b7a6ff. Offline Plus Jakarta Sans display, Inter body. Reuse the site's
28px Card radius, 6.5% white edge, dark vertical surface and inset top highlight.
Pill actions use the same lime material; badges inherit the small lime disc.
Icons are the supplied 24px stroke paths. No admin sidebar.

BlurWords and Reveal retain the site's blur/travel and [.16,1,.3,1] easing.
LoopVideo only plays while visible and pauses on reduced motion. Brand float,
twinkle, ripple, orbit and glow keyframes are carried over. Focus/selection and
reduced motion are first-class states. The device's live key travel and knob
rotation communicate actual interaction; no animation substitutes for status.

## Surfaces

Device: profile pills, a verified device island, one centered tactile pad and a
right-hand programming sheet. Abilities: asymmetric featured abilities followed
by compact install rows with explicit permissions/bindings. Connect: progressive
transport/pairing, actual discoveries and signed-firmware setup state. Agent:
provider cards, masked keys, persona/voice and real conversation timeline.
Markets: dense chart/ticket plus outcomes and live signals. Activity: one
chronological timeline with real provenance, filters and honest empty states.
Command palette: keyboard navigation across screens/actions, never a signing
shortcut. Operate mode throughout; all existing v1 features remain reachable.
