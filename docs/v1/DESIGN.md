# XOR desk v1 design

The interaction references are [Elgato’s action/property inspector guide](https://www.elgato.com/us/en/explorer/products/stream-deck/how-to-set-up-stream-deck-hotkeys/) and [Hyperliquid’s trading documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/trading).

T5 is an Operate surface: a Solana trader programs a physical pad, compares live
routes and supervises gated proposals. The supplied Stream Deck and professional
trading terminal references pin the composition. Classic remains at `/classic`.

## Concrete reference takes

The four supplied images were inspected directly; no reference artwork or copy
is shipped. w64: align market, route and ticket regions; use tabular readouts and
horizontal separators. w99: group evidence and approvals with explicit borders,
monospace metadata and restrained status color. w131: one clear recovery action
for an empty state, generous phone controls and readable numerical hierarchy.
w92: give conversation history its own navigable space and keep the active
transcript dominant; its photographic backdrop and glass are deliberately absent.

## Colors

`desk/renderer/ui/desk.css` is the token source. Surfaces use `--bg`, `--panel`
and `--raised`; borders use `--line`. Accent marks selection and primary actions;
good/bad colors supplement explicit status text.

| CSS token | Floor (default) | Paper | Neon |
| --- | --- | --- | --- |
| `--bg` | #111412 | #f1f0e9 | #050806 |
| `--panel` | #191d1a | #fafaf5 | #0b110d |
| `--raised` | #222823 | #e8e9df | #152119 |
| `--ink` | #edf0e8 | #20291e | #fff |
| `--muted` | #a7b0a5 | #566150 | #becdbf |
| `--line` | #3a443b | #b9c1af | #5a775e |
| `--accent` | #cfed89 | #36571b | #bdff32 |
| `--accent-ink` | #1b260c | #fff | #101900 |
| `--bad` | #ff9287 | #ad271c | #ff9cae |
| `--good` | #a7e6be | #21613b | #67ffc7 |
| `--focus` | #e7ffac | #3c5fbb | #3de3ff |

Theme selection sets `data-theme` and persists as `xorr-theme` in local storage.
Floor and Neon use dark native controls; Paper uses light native controls.

## Typography

The shipped Archivo variable font covers the interface, with `system-ui,
sans-serif` fallbacks. Body is 14 px / 1.55. Page headings are 36 px / 1.1,
weight 550, with -1.2 px tracking; they become 30 px on phones. Panel headings
are 16 px / 1.3 and row headings 14 px, both weight 550. Descriptions stop at
65 ch; phone page descriptions are 13 px.

Shipped Azeret variable, with a monospace fallback, covers 10 px eyebrows
(0.12 em tracking), 10–12 px metadata and 20 px stat/TFT readouts. Phone TFT
readouts become 17 px. `.mono` and table values use tabular numerals; identifiers,
signatures and evidence wrap. No external fonts or Inter Tight.

## Layout

- Desktop: 214 px left rail, top bar with 76 px minimum height, 32 px content
  gutters. Main grids use `minmax(0, 1.6fr) minmax(280px, 1fr)` with 20 px gaps;
  equal grids split 1:1. At 1600 px and above, main content is centered with a
  1500 px maximum width. The rail is sticky and independently scrollable above
  700 px.
- At 1050 px and below: rail becomes 190 px, content gutters become 24 px and
  both main/equal grids stack. Chats use a 230 px minimum history column with
  a 0.7:1.8 split until this same breakpoint.
- At 700 px and below: navigation opens from an explicit menu below the 68 px
  top bar, with two columns of links. Main padding is 25 px vertically and 16 px
  horizontally. Heading actions, row actions and footer wrap or stack; form
  fields collapse to one column. Forms and children allow shrinking and long
  help text wraps, including at 375 px.
- Spacing follows 4/8/12/16/20/24/32 px steps with specific container insets:
  desktop panel bodies are 22 px, heads 18 px by 22 px; phone bodies are 18 px
  and heads 16 px by 18 px. Form gaps are 22 px, field gaps 18 px.
- Tables scroll inside their wrappers and have a 450 px minimum width on
  phones. Trade markets scroll at 420 px maximum height; prediction markets at
  620 px, keeper markets and resolutions at 500 px. Transcripts scroll between
  a 350 px minimum and 580 px maximum height.

## Elevation & Depth

Panels are separated by tonal surfaces and one-pixel borders. Only the physical
device has a structural shadow: `0 12px 0 var(--panel)`. The connection dialog
uses a solid panel and a `#0009` backdrop. No glass effects.

## Shapes

Panels, stat groups and dialogs use 12 px corners; controls and navigation use
6 px; tags use 4 px; transcript messages and notices use 8 px. The physical pad
has a two-pixel border and 22 px corners, reduced to 16 px on phones. Its four
key columns use 10 px gaps (7 px on phones), with 70 px minimum key height
(61 px on phones) and a four-pixel bottom border. The knob is circular, 68 px
on desktop and 54 px on phones.

## Components

- Navigation: semantic links with 20 px SVG line icons, muted default text and
  a raised/accent current-page state. Links are at least 46 px high; Classic
  remains available at `/classic`.
- Controls: labelled native fields and selects; raised secondary buttons,
  accent primary buttons (weight 650), danger text for destructive actions.
  Buttons, inputs and selects have 44 px minimum height with 10 px by 12 px
  padding. Checkboxes are 22 px inside 44 px label rows. Actions wrap and
  disable during requests; hover brightens buttons and links by 1.12.
- Panels and rows: explicit heading/body separation, compact venue rows,
  bordered status tags, tabular readouts and native evidence disclosures.
  Best-route rows use the raised surface and a text marker. Signals expose
  separate Accept/Refuse actions only while awaiting a decision.
- Pad: live device on the left, draggable action library on the right, selected
  key settings beneath the device. Selecting a key and clicking an action also
  supports touch and keyboard assignment. Assignments are staged until
  **Save & push keymap**; Accept, Refuse, mic and kill actions/positions remain
  fixed while their labels can be edited. Selected keys have an accent outline;
  live key presses fill with accent. Link/key/knob events update the mirror.
  `/events` snapshots and signals drive the TFT proposal, amount, expiry
  countdown and confirmation prompt; receipt events show a confirmed signature
  for 15 seconds. Without a connected pad the TFT shows its setup state.
- Trade and Predict: market selection fills the ticket; a live quote precedes
  proposal creation. Editing quote inputs invalidates the quote and disables
  proposal creation. The Trade queue handles acceptance, wallet signing and
  receipt verification. Prediction collateral is explicitly devnet mUSDC.
- Positions: wallet holdings above venue/outcome positions, followed by
  signature/explorer receipts from the live queue and persisted memory.
- Chats: searchable history and model controls beside the dominant transcript,
  with tool calls in native disclosures. Loading available models preserves the
  configured selection when it is available; a missing selection has an
  explicit chooser. Model changes save through agent settings.
- Agent, Permissions and Link: masked credential entry/status, provider/persona
  and voice controls, explicit unit-labelled caps and auto-accept scope, verified
  transport/firmware status and provisioning instructions. The connection token
  uses a modal form; notices report request outcomes.
- Backtest: configuration and assumptions beside results; the equity plot,
  statistics, trade log and provenance appear only from returned replay data.
- State and accessibility: distinct loading (`role="status"`), empty, setup and
  error (`role="alert"`) treatments; status notices and TFT updates use live
  regions. A skip link targets content, focus uses a two-pixel `--focus` outline
  with four-pixel offset, and reduced-motion disables animation, transitions and
  smooth scrolling.

## Do's and Don'ts

- Do keep server/chain measurements unit-labelled and unavailable values
  explicit. A receipt requires an actual signature; acceptance alone is not one.
- Do use real data or designed loading, empty, setup and error states.
- Do retain the device/library/settings and market/routes/ticket compositions.
- Don't add decorative charts, seeded financial data, external fonts or glass.

## Page/API map

Pad: `/pad/keymap`, `/desk/link`, `/signals`, `/events`. Trade:
`/venues?markets=1`, `/route`, `/signals` and its accept/refuse/sign actions.
Predict: `/pm/markets`, `/pm/ours`,
`/pm/resolutions`, `/pm/stats`. Positions: `/portfolio`, `/perps/positions`,
`/pm/positions`, `/memory`, `/signals`. Chats/Agent: existing `/chats` and
`/agent/*`. Permissions: `/permissions`. Backtest: T6 `/backtest*`.
Link: `/desk/link` plus the documented pad provisioning protocol.
