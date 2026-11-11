# T3 — models, tools, conversations and voice

Open **Models & keys** on the desk. API keys are encrypted by Electron
`safeStorage` and displayed only as `••••last4`. Node-only servers refuse key
persistence when OS encryption is unavailable. Existing plaintext key files are
not imported; re-enter keys in the desk. No provider key goes to the pad.
The Electron/backend default port is 8710.

Choose Ollama with a root URL (localhost or the Mac mini over Tailscale),
Anthropic (default `claude-haiku-5-5`), or an OpenAI-compatible service with its
API base URL, including `/v1` where required. **Load models** queries the actual
Ollama `/api/tags` or provider `/models` endpoint. No model catalog is fabricated.
Missing keys report `Setup required: <provider> API key`. Select a model for
OpenAI-compatible services; an unselected Ollama uses the first installed model.

The Chats pane lists/searches conversations, opens their transcripts, renames or
deletes them, and exports Markdown. Messages, assistant tool calls, tool results,
provider and model persist in private, atomic per-conversation JSON files in the
app data directory. Concurrent turns, rename and deletion on an active chat are
refused. Interrupted tool calls are recorded as interrupted on recovery and are
not replayed. A model/provider change applies to subsequent turns; each message
keeps its own metadata.

The agent exposes `route`, `propose_trade`, `positions`, `pm_markets`, `pm_stats`,
`backtest` and `explain_refusal`. Tools call the existing real desk endpoints.
`propose_trade` creates a T2 signal via `/signals`, including the memory and
permissions gate. The model has no accept, signing, execution or policy-write
tool. Tool calls/results appear in chat and authenticated `/events`. Backtest
uses T6's `POST /backtest`; without T6 it reports
`Setup required: T6 backtest engine`.

Edit or reset the persona in settings. The default is xorr's short, slang trader
voice. Fixed prompt rules retain exact supplied numbers, explain unknown fees or
liquidation as unavailable, state venue/risk, and distinguish proposals from
confirmed signatures. Deterministic proposal/auto-accept speech uses the gate's
final size and real quote values. Prompt instructions supplement the actual gate;
they do not authorize signing.

With a stored Deepgram key, pad PCM chunks immediately enter a Nova-3 WebSocket
at 16 kHz, signed 16-bit mono. Interim/final transcripts appear on `/events`.
Aura TTS returns raw PCM in ordered chunks to pad I2S and desk playback. Enable
desk audio with a user gesture. Speech is serialized so replies cannot interleave.
Input is limited to 12 seconds; sequence errors, timeouts, disconnects and partial
samples abort. The HTTP `/voice` path also streams its PCM response.

`voice.mjs` remains available: pads without a stored key retain its assembled
utterance path; `/voice?fallback=legacy` explicitly selects it. It can use stored
Deepgram/Groq keys or its existing environment/CLI fallback. A failed configured
model can use the old voice brain with an explicit `voice_fallback` event;
missing model/key setup is reported instead of silently changing providers.
The live-provider tests read only `process.env`, never `.env` or `~/.config`.

## Authenticated HTTP surface

Use the existing pad bearer token for every endpoint below.

| Endpoint | Methods | Purpose |
| --- | --- | --- |
| `/agent/settings` | GET, POST | Provider, URL, model, masked keys, editable persona; POST `{resetPersona:true}` resets style |
| `/agent/keys` | POST | `{provider,key}`; an empty key removes it; requires Electron encryption |
| `/agent/models` | GET | Real model discovery; optional provider/baseUrl/model query parameters |
| `/agent/chat` | POST | `{message,chatId?,speak?}`; creates a chat if needed |
| `/chats` | GET, POST | List/search with `?search=`, or create with optional `{title}` |
| `/chats/:id` | GET, POST, PATCH, DELETE | Read, send `{message,speak?}`, rename `{title}`, delete |
| `/chats/:id?export=markdown` | GET | Download Markdown including tools and results |

Chat replies retain their text if speech setup fails and return `voiceError`.
The desk displays that setup error. Local `/setup` also encrypts credentials;
changing the pad token takes effect after restarting the app.

## Verification

Run `cd desk && npm run test:agent`. See the T3 section of `TESTING.md` for
observed counts and limitations. Live Anthropic/Deepgram checks require their
respective environment keys. Ollama runs only when localhost is reachable and
has a model. The real OS encryption test starts Electron without a window,
round-trips a generated secret, checks masked listing/ciphertext, and removes it.
No T3 test sends a blockchain transaction.

API formats were checked against [official OpenAI Chat Completions documentation](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create),
[Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create),
[Ollama chat](https://docs.ollama.com/api/chat),
[Deepgram streaming STT](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)
and [Deepgram streaming TTS](https://developers.deepgram.com/reference/text-to-speech/speak-streaming).
