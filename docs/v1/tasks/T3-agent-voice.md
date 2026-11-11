# T3: the agent: models, keys, chat history, Deepgram voice, slang persona

Read `docs/v1/SPEC.md` first.

1. **Providers.** Add `desk/main/llm.mjs`, one interface over several providers:
   - **Ollama.** Set by URL, typically the Mac mini over Tailscale, e.g. `http://mac-mini.tailnet:11434`.
   - **Anthropic.** Default model `claude-haiku-5-5`.
   - **OpenAI-compatible.** OpenRouter, or any base URL.

   Key handling:
   - Keys are stored only through `safeStorage`, and listed as `••••last4`.
   - Missing key → `Setup required: <provider> API key`.
   - The model list comes from each provider's real `/models` endpoint where one exists.
2. **Tools.** The agent gets real tools:
   - `route` (T1), `propose_trade` (creates a signal, T2), `positions`, `pm_markets`, `pm_stats`, `backtest` (T6) and `explain_refusal`.
   - **The model never decides alone.** Proposals always go through the gate.
   - Tool calls are visible in the chat transcript.
3. **Chat history.** Persisted per conversation: messages, tool calls, results and model. Supports list, search, rename, delete and export as Markdown. Endpoints: `/chats` and `/chats/:id`.
4. **Persona.** The voice is "xorr", a desk-trader friend:
   - Talks in slang ("ser", "we're so back", "that's a fade", "size down, degen"), short sentences.
   - **Exact numbers** for price, size, fees and liquidation, and always says the risk and the venue.
   - Never pretends a trade happened before a signature exists.
   - The persona is editable in settings, with a reset-to-default.
5. **Voice.** Add `desk/main/voice-deepgram.mjs`:
   - Pad mic audio arrives over the pad link (T4) as 16 kHz PCM chunks; transcribe it live with Deepgram (`nova-3`).
   - Replies are spoken with Deepgram TTS (Aura), streamed back to the pad's amp and played on the desk.
   - The key is stored through `safeStorage`; missing → `Setup required: Deepgram API key`.
   - Keep the existing `voice.mjs` path as a fallback; don't remove it.
6. **Tests.**
   - Unit tests for the provider abstraction, using a real Ollama if it is reachable on localhost and skipping it otherwise.
   - Persona prompt assembly.
   - Chat persistence.
   - Live Deepgram and Anthropic tests run only when their keys exist in the environment (`DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`), and skip with a reason otherwise. Don't read `~/.config` files.

Make one commit per step.
