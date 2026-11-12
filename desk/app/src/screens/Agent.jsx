import React, { useState, useEffect } from "react";
import { useDesk, useRead, State, Empty, Field, money } from "../core";
import { Card } from "../brand/Card";
import { Icon } from "../brand/Icon";
import { BlurWords } from "../brand/BlurWords";
const providers = [
  {
    id: "ollama",
    name: "Ollama",
    sub: "Your Mac mini. Your model.",
    url: "http://localhost:11434",
    icon: "users",
    tone: "lime",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    sub: "Bring your Claude key.",
    url: "https://api.anthropic.com/v1",
    icon: "bolt",
    tone: "lavender",
  },
  {
    id: "openai",
    name: "OpenRouter",
    sub: "One connection. Your choice of models.",
    url: "https://openrouter.ai/api/v1",
    icon: "repeat",
    tone: "cobalt",
  },
];
export function Agent() {
  const d = useDesk(),
    settings = useRead("/agent/settings"),
    chats = useRead("/chats"),
    status = useRead("/desk/status");
  const [edit, setEdit] = useState(null),
    [models, setModels] = useState(null),
    [modelError, setModelError] = useState(""),
    [selected, setSelected] = useState(null),
    [conversation, setConversation] = useState(null),
    [answering, setAnswering] = useState(false);
  const config = edit || settings.data;
  useEffect(() => {
    const id = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "chat",
    );
    if (id) open(id);
  }, [d.api]);
  async function discover() {
    setModelError("");
    setModels(null);
    try {
      const r = await d.api(
        "/agent/models?" +
          new URLSearchParams({
            provider: config.provider,
            baseUrl: config.baseUrl,
            model: config.model || "",
          }),
      );
      setModels(r);
    } catch (e) {
      setModelError(e.message);
    }
  }
  async function open(id) {
    await d.run(async () => {
      setSelected(id);
      setConversation(await d.api("/chats/" + id));
    });
  }
  return (
    <section className="page agent-page">
      <div className="page-heading">
        <div>
          <h1>
            <BlurWords text={"A voice that gets you."} immediate />
          </h1>
          <p>Your model. Your persona. An agent that plays by your rules.</p>
        </div>
        <span className="badge">Bring your own intelligence</span>
      </div>
      <State state={settings} />
      {settings.data && (
        <>
          <div className="model-cards">
            {providers.map((p) => (
              <button
                key={p.id}
                className={"model-card tone-" + p.tone}
                aria-pressed={config.provider === p.id}
                onClick={() => {
                  setEdit({
                    provider: p.id,
                    baseUrl:
                      settings.data.provider === p.id
                        ? settings.data.baseUrl
                        : p.url,
                    model:
                      settings.data.provider === p.id
                        ? settings.data.model
                        : "",
                  });
                  setModels(null);
                  setModelError("");
                }}
              >
                <span className="model-avatar">
                  <Icon name={p.icon} />
                </span>
                <span className="model-card-status">
                  {settings.data.provider === p.id
                    ? "In use"
                    : p.id === "ollama"
                      ? "Local discovery"
                      : settings.data.keys[p.id]
                        ? "Key stored"
                        : "Key required"}
                </span>
                <h2>{p.name}</h2>
                <p>{p.sub}</p>
                <small>
                  {settings.data.provider === p.id
                    ? settings.data.model || "Setup required: select a model"
                    : "Choose provider"}{" "}
                  <Icon name="arrowUpRight" />
                </small>
              </button>
            ))}
          </div>
          <div className="agent-layout">
            <div>
              <section className="surface">
                <div className="section-title">
                  <h2>Make the connection.</h2>
                  <Icon name="repeat" />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    d.run(async () => {
                      await d.api("/agent/settings", {
                        provider: config.provider,
                        baseUrl: f.get("baseUrl"),
                        model: f.get("model"),
                      });
                      setEdit(null);
                      d.refresh();
                      d.notify("Model settings saved.");
                    });
                  }}
                >
                  <Field label="Provider URL">
                    <input
                      name="baseUrl"
                      type="url"
                      key={config.provider}
                      defaultValue={config.baseUrl}
                      required
                    />
                  </Field>
                  <div className="field-row">
                    <Field label="Model ID">
                      <input
                        name="model"
                        key={config.provider + "model"}
                        defaultValue={config.model}
                        list="available-models"
                        placeholder="Discover or enter a model ID"
                      />
                    </Field>
                    <button
                      type="button"
                      className="discover-button"
                      onClick={discover}
                    >
                      Discover models <Icon name="arrowUpRight" />
                    </button>
                  </div>
                  <datalist id="available-models">
                    {models?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </datalist>
                  {models && (
                    <p className="success">
                      {models.length} models returned by the provider.
                    </p>
                  )}
                  {modelError && (
                    <p className="setup-note" role="alert">
                      {modelError}
                    </p>
                  )}
                  <button className="primary">Save model</button>
                </form>
              </section>
              <section className="persona-section">
                <h2>A little personality.</h2>
                <p>
                  Style is yours to shape. Factual accuracy and trading
                  permissions stay fixed.
                </p>
                <div className="persona-samples">
                  <span>“Ser.”</span>
                  <span>“That’s a fade.”</span>
                  <span>“Size down, degen.”</span>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const persona = new FormData(e.currentTarget).get(
                      "persona",
                    );
                    d.run(async () => {
                      await d.api("/agent/settings", { persona });
                      d.refresh();
                      d.notify(
                        "Persona saved. Trading constraints remain fixed.",
                      );
                    });
                  }}
                >
                  <Field label="Agent persona">
                    <textarea
                      name="persona"
                      maxLength={8000}
                      defaultValue={settings.data.persona}
                      required
                    />
                  </Field>
                  <div className="actions">
                    <button>Save persona</button>
                    <button
                      type="button"
                      onClick={() =>
                        d.run(async () => {
                          await d.api("/agent/settings", {
                            resetPersona: true,
                          });
                          d.refresh();
                        })
                      }
                    >
                      Reset to xorr
                    </button>
                  </div>
                </form>
              </section>
            </div>
            <div>
              <Card className="keys-card">
                <Icon name="lock" />
                <h2>Your keys. Kept yours.</h2>
                <p>
                  Stored with Electron’s OS encryption. Never sent to the pad.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      f = new FormData(form),
                      key = String(f.get("key"));
                    form.elements.key.value = "";
                    d.run(async () => {
                      await d.api("/agent/keys", {
                        provider: f.get("provider"),
                        key,
                      });
                      d.refresh();
                      d.notify("Encrypted credential saved.");
                    });
                  }}
                >
                  <Field label="Credential">
                    <select name="provider">
                      {[
                        ["anthropic", "Anthropic"],
                        ["openai", "OpenRouter"],
                        ["deepgram", "Deepgram"],
                        ["tailscale", "Tailscale"],
                      ].map(([id, name]) => (
                        <option key={id} value={id}>
                          {name} · {settings.data.keys[id] || "Not configured"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="New API key">
                    <input
                      name="key"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </Field>
                  <button className="primary">
                    Save encrypted key <Icon name="lock" />
                  </button>
                </form>
              </Card>
              <section className="voice-card">
                <div className="voice-orb">
                  <Icon name="wave" />
                </div>
                <h2>Hear it from your pad.</h2>
                <p>
                  Deepgram’s voice, through the pad’s speaker. Hold the fixed
                  mic key to talk back.
                </p>
                <button
                  onClick={() =>
                    d.run(async () => {
                      await d.api("/agent/voice-test", {});
                      d.notify("Speech streamed to the verified pad.");
                    })
                  }
                >
                  Test pad voice <Icon name="play" />
                </button>
                <p className="setup-note">
                  {settings.data.keys.deepgram
                    ? "Connect a verified pad for playback."
                    : "Setup required: Deepgram API key and a connected pad."}
                </p>
              </section>
              <details className="wallet-settings">
                <summary>Signing & session wallet</summary>
                <p>
                  Phone signing is the default. Session signing is opt-in,
                  capped, and still requires the mainnet acknowledgement.
                </p>
                <p>
                  {status.data?.wallet?.publicKey ||
                    status.data?.wallet?.setupRequired ||
                    "Reading wallet status…"}
                </p>
                <div className="actions">
                  <button
                    onClick={() =>
                      d.run(async () => {
                        await d.api("/wallet/mode", { mode: "phone" });
                        d.refresh();
                        d.notify("Phone signing selected");
                      })
                    }
                  >
                    Use phone
                  </button>
                  <button
                    onClick={() =>
                      d.run(async () => {
                        await d.api("/session-wallet", {});
                        d.refresh();
                        d.notify(
                          "Session wallet created. Fund its public key before use.",
                        );
                      })
                    }
                  >
                    Create session wallet
                  </button>
                  <button
                    onClick={() =>
                      d.run(async () => {
                        await d.api("/wallet/mode", { mode: "session" });
                        d.refresh();
                        d.notify(
                          "Session mode selected. Funding, cluster and caps still apply.",
                        );
                      })
                    }
                  >
                    Use session
                  </button>
                </div>
              </details>
            </div>
          </div>
        </>
      )}
      <section className="chat-workspace">
        <div className="section-title">
          <div>
            <h2>Pick up the conversation.</h2>
            <p>Your actual history, not a fresh start every time.</p>
          </div>
          <button
            onClick={() => {
              setSelected(null);
              setConversation(null);
            }}
          >
            New conversation <Icon name="arrowUpRight" />
          </button>
        </div>
        <State state={chats} />
        <div className="chat-layout">
          <div className="conversation-list">
            {chats.data?.length ? (
              chats.data.map((c) => (
                <button
                  key={c.id}
                  aria-pressed={selected === c.id}
                  onClick={() => open(c.id)}
                >
                  <b>{c.title}</b>
                  <span>
                    {c.provider} · {c.messageCount} messages
                  </span>
                  <small>{new Date(c.updatedAt).toLocaleString()}</small>
                </button>
              ))
            ) : (
              <Empty title="Your next conversation starts here.">
                Setup required: choose a model, then send your first message.
              </Empty>
            )}
          </div>
          <div className="chat-panel">
            {conversation?.messages.map((m, i) => (
              <article className={"chat-message role-" + m.role} key={i}>
                <span>
                  {m.role} · {new Date(m.at).toLocaleTimeString()}
                </span>
                <p>{m.content}</p>
                {m.toolCalls?.map((t) => (
                  <details key={t.id}>
                    <summary>{t.name}</summary>
                    <pre>{JSON.stringify(t.arguments, null, 2)}</pre>
                  </details>
                ))}
              </article>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  message = String(new FormData(form).get("message"));
                setAnswering(true);
                try {
                  const r = await d.api("/agent/chat", {
                    message,
                    chatId: selected || undefined,
                    speak: false,
                  });
                  setSelected(r.chatId);
                  if (r.chatId)
                    setConversation(await d.api("/chats/" + r.chatId));
                  form.reset();
                  d.refresh();
                } catch (e) {
                  d.notify(e.message);
                  d.refresh();
                } finally {
                  setAnswering(false);
                }
              }}
            >
              <Field label="Message your agent">
                <textarea
                  name="message"
                  placeholder="What are you thinking?"
                  maxLength={16000}
                  required
                />
              </Field>
              <button className="primary" disabled={answering}>
                {answering ? "Your model is answering…" : "Send message"}{" "}
                <Icon name="arrowUpRight" />
              </button>
              <small>
                Trade requests become gated proposals. A conversation never
                bypasses your permissions.
              </small>
            </form>
          </div>
        </div>
      </section>
    </section>
  );
}
