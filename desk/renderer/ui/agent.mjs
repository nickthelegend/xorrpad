import {
  $,
  esc,
  heading,
  panel,
  loading,
  error,
  options,
  action,
  notice,
} from "./shared.mjs";
const defaults = {
  ollama: "http://localhost:11434",
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://openrouter.ai/api/v1",
};
export async function mount({ el, api, subscribe, signal }) {
  el.innerHTML =
    heading(
      "06",
      "Your agent. Your terms.",
      "Connect a model, shape its persona, and give the pad a voice.",
      "KEYS ENCRYPTED BY ELECTRON",
    ) +
    `<div class="grid"><div class="stack">${panel("Model provider", `<div id="provider-form">${loading()}</div>`)}${panel("Persona", `<div id="persona-form">${loading()}</div>`)}</div><div class="stack">${panel("API keys", `<div class="panel-body"><p class="muted">Keys are masked and stored by Electron safeStorage. Enter them in the desktop app; the web desk reports setup required when OS encryption is unavailable.</p><form id="key-form"><label>Credential<select name="provider">${options(["anthropic", "openai", "deepgram", "groq", "tailscale"])}</select></label><div id="key-status" class="hint">Loading key status…</div><label>New API key<input name="key" type="password" autocomplete="new-password" required maxlength="16384"></label><div class="actions"><button class="primary">Save encrypted key</button><button type="button" id="remove-key">Remove key</button></div><div id="key-result"></div></form></div>`)}${panel("Voice", `<div class="panel-body"><div class="row-top"><h3>Deepgram</h3><span class="tag">PAD MICROPHONE</span></div><p class="muted">Nova-3 live transcription and Aura-2 Thalia speech. Hold the pad’s microphone key to speak; the shared persona guides its response.</p><button id="audio-enable">Enable desk audio</button><p class="hint">Replies also stream to the pad’s amplifier. Audio: 16 kHz mono PCM.</p><div id="voice-transcript" aria-live="polite" class="hint">No voice transcript received this session.</div></div>`)}</div></div>`;
  let settings;
  const status = () => {
    $("#key-status", el).textContent =
      settings?.keys?.[$("#key-form", el).elements.provider.value] ||
      "No masked key reported. Enter a key to configure this provider.";
  };
  function forms() {
    const s = settings;
    $("#provider-form", el).innerHTML =
      `<form class="panel-body" id="settings-form"><label>Provider<select name="provider">${options(
        [
          { id: "ollama", name: "Ollama · local or Tailscale" },
          { id: "anthropic", name: "Anthropic" },
          { id: "openai", name: "OpenAI-compatible · OpenRouter" },
        ],
        s.provider,
      )}</select></label><label>Provider base URL<input name="baseUrl" type="url" required value="${esc(s.baseUrl)}"></label><label>Model ID<input name="model" value="${esc(s.model)}" placeholder="Select or enter a provider model ID" list="agent-models"></label><datalist id="agent-models"></datalist><div class="actions"><button class="primary">Save provider</button><button type="button" id="discover-models">Discover models</button></div><div id="settings-result"></div></form>`;
    $("#persona-form", el).innerHTML =
      `<form class="panel-body" id="persona"><label>Agent instructions<textarea name="persona" maxlength="8000" required style="min-height:220px">${esc(s.persona)}</textarea></label><div class="actions"><button class="primary">Save persona</button><button type="button" id="reset-persona">Reset to XOR persona</button></div></form>`;
    const f = $("#settings-form", el);
    f.elements.provider.onchange = () => {
      f.elements.baseUrl.value = defaults[f.elements.provider.value];
      f.elements.model.value = "";
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      action(e.submitter, async () => {
        const r = await api(
          "/agent/settings",
          Object.fromEntries(new FormData(f)),
        );
        settings = { ...settings, ...r };
        notice("Provider saved");
      });
    };
    $("#discover-models", el).onclick = (e) =>
      action(e.currentTarget, async () => {
        const q = new URLSearchParams(new FormData(f));
        const models = await api("/agent/models?" + q);
        $("#agent-models", el).innerHTML = options(models);
        $("#settings-result", el).innerHTML =
          `<p>${models.length} models available. Choose from the model field.</p>`;
      });
    $("#persona", el).onsubmit = (e) => {
      e.preventDefault();
      action(e.submitter, async () => {
        await api("/agent/settings", {
          persona: new FormData(e.target).get("persona"),
        });
        notice("Persona saved");
      });
    };
    $("#reset-persona", el).onclick = (e) =>
      action(e.currentTarget, async () => {
        const r = await api("/agent/settings", { resetPersona: true });
        $("#persona", el).elements.persona.value = r.persona;
        notice("XOR persona restored");
      });
    status();
  }
  const k = $("#key-form", el);
  k.elements.provider.onchange = status;
  k.onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      const input = k.elements.key;
      const value = input.value;
      input.value = "";
      try {
        const r = await api("/agent/keys", {
          provider: k.elements.provider.value,
          key: value,
        });
        settings ??= { keys: {} };
        settings.keys ??= {};
        settings.keys[r.provider] = r.key;
        status();
        $("#key-result", el).textContent = "Encrypted key saved.";
      } catch (e) {
        $("#key-result", el).innerHTML = error(e);
        throw e;
      }
    });
  };
  $("#remove-key", el).onclick = (e) =>
    action(e.currentTarget, async () => {
      const r = await api("/agent/keys", {
        provider: k.elements.provider.value,
        key: "",
      });
      if (settings?.keys) settings.keys[r.provider] = "";
      status();
      notice("Credential removed");
    });
  $("#audio-enable", el).onclick = () => {
    window.dispatchEvent(new Event("xorr-enable-audio"));
    $("#audio-enable", el).textContent = "Desk audio enabled";
  };
  const off = subscribe((e) => {
    if (e.type === "transcript" || e.type === "voice_transcript")
      $("#voice-transcript", el).textContent = e.text || e.transcript || "";
  });
  try {
    settings = await api("/agent/settings");
    if (!signal.aborted) forms();
  } catch (e) {
    if (!signal.aborted) {
      $("#provider-form", el).innerHTML = error(e);
      $("#persona-form", el).innerHTML = error(e);
      $("#key-status", el).textContent = e.message;
    }
  }
  return off;
}
