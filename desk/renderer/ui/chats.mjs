import {
  $,
  esc,
  heading,
  panel,
  empty,
  loading,
  error,
  options,
  action,
  notice,
  detail,
} from "./shared.mjs";
export async function mount({ el, api, subscribe, signal }) {
  el.innerHTML =
    heading(
      "05",
      "A conversation with context.",
      "Your model, your memory, and a visible record of every tool call.",
      "BRING YOUR OWN MODEL",
    ) +
    `<div class="grid chat-grid"><div class="stack">${panel("Conversations", `<div class="panel-body"><label>Search history<input id="chat-search" type="search" placeholder="Search messages or titles"></label><button id="new-chat" class="primary" style="width:100%;margin-top:14px">New conversation</button></div><div id="chat-list">${loading()}</div>`)}${panel("Model", `<div class="panel-body"><label>Active model<select id="chat-model"><option value="">Load models from provider</option></select></label><button id="load-models" style="margin-top:12px">Load available models</button><p class="hint" id="model-provider">Loading provider…</p><a class="button" href="#agent">Configure provider →</a></div>`)}</div>${panel("Transcript", `<div class="panel-body" id="chat-controls" hidden><form id="rename-chat"><label>Conversation title<input name="title" maxlength="200" required></label><div class="actions"><button>Rename</button><button type="button" id="export-chat">Export Markdown</button><button type="button" id="delete-chat" class="danger">Delete conversation</button></div></form></div><div class="transcript" id="transcript">${empty("What are you thinking?", "Start a conversation to research markets, inspect the book, or propose a trade.")}</div><form class="panel-body" id="chat-composer"><label>Message<textarea name="message" required maxlength="16000" placeholder="Ask your agent…"></textarea></label><div class="actions"><button class="primary">Send message</button><label class="check"><input type="checkbox" name="speak"> Speak reply</label></div><p class="hint">Trade requests create gated proposals. Review them in the Trade queue.</p><div id="chat-error"></div></form>`)}</div>`;
  let activeModel = "",
    selected,
    chat,
    searchTimer,
    searchSequence = 0;
  async function list() {
    const n = ++searchSequence;
    try {
      const rows = await api(
        "/chats?search=" + encodeURIComponent($("#chat-search", el).value),
      );
      if (signal.aborted || n !== searchSequence) return;
      $("#chat-list", el).innerHTML = rows.length
        ? rows
            .map(
              (c) =>
                `<div class="row"><button data-chat="${esc(c.id)}" style="width:100%;text-align:left" ${selected === c.id ? 'aria-current="true"' : ""}>${esc(c.title)}<br><span class="hint">${esc(c.provider)} · ${c.messageCount} messages</span></button></div>`,
            )
            .join("")
        : empty(
            "No conversations found",
            "Create a conversation or try another search.",
          );
      for (const b of el.querySelectorAll("[data-chat]"))
        b.onclick = () => open(b.dataset.chat);
    } catch (e) {
      if (!signal.aborted) $("#chat-list", el).innerHTML = error(e);
    }
  }
  function transcript() {
    if (!chat) return;
    $("#chat-controls", el).hidden = false;
    $("#rename-chat", el).elements.title.value = chat.title;
    $("#transcript", el).innerHTML = chat.messages.length
      ? chat.messages
          .map(
            (m) =>
              `<article class="message"><div class="eyebrow">${esc(m.role)}${m.name ? " / " + esc(m.name) : ""}</div>${m.content ? `<p>${esc(m.content)}</p>` : ""}${(m.toolCalls || []).map((t) => detail("Tool call / " + t.name, t.arguments)).join("")}<span class="hint">${esc(m.model || "")} · ${esc(m.at || "")}</span></article>`,
          )
          .join("")
      : empty("Conversation ready", "Send your first message in this conversation.", {target:'#chat-composer textarea',label:'Write a message'});
  }
  async function open(id) {
    selected = id;
    try {
      const c = await api("/chats/" + id);
      if (signal.aborted || id !== selected) return;
      chat = c;
      transcript();
      await list();
    } catch (e) {
      if (!signal.aborted) $("#transcript", el).innerHTML = error(e);
    }
  }
  $("#chat-search", el).oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(list, 250);
  };
  $("#new-chat", el).onclick = (e) =>
    action(e.currentTarget, async () => {
      const c = await api("/chats", { title: "New conversation" });
      await open(c.id);
    });
  $("#rename-chat", el).onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      if (!selected) return;
      chat = await api(
        "/chats/" + selected,
        { title: new FormData(e.target).get("title") },
        { method: "PATCH" },
      );
      await list();
      notice("Conversation renamed");
    });
  };
  $("#delete-chat", el).onclick = (e) =>
    action(e.currentTarget, async () => {
      if (!selected) return;
      await api("/chats/" + selected, undefined, { method: "DELETE" });
      selected = null;
      chat = null;
      $("#chat-controls", el).hidden = true;
      $("#transcript", el).innerHTML = empty(
        "Conversation deleted",
        "Start a new conversation when you are ready.",
      );
      await list();
    });
  $("#export-chat", el).onclick = (e) =>
    action(e.currentTarget, async () => {
      if (!chat) return;
      const md = [
        "# " + chat.title,
        "",
        ...chat.messages.flatMap((m) => [
          "## " + m.role,
          "",
          m.content || "",
          ...(m.toolCalls || []).map(
            (t) =>
              "Tool " + t.name + "\n" + JSON.stringify(t.arguments, null, 2),
          ),
          "",
        ]),
      ].join("\n");
      const url = URL.createObjectURL(
        new Blob([md], { type: "text/markdown" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = chat.id + ".md";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  $("#chat-composer", el).onsubmit = (e) => {
    e.preventDefault();
    action(e.submitter, async () => {
      const f = new FormData(e.target);
      $("#chat-error", el).innerHTML = loading();
      try {
        const r = await api("/agent/chat", {
          message: f.get("message"),
          chatId: selected,
          speak: f.has("speak"),
        });
        if (signal.aborted) return;
        selected = r.chatId;
        await open(selected);
        e.target.elements.message.value = "";
        $("#chat-error", el).innerHTML = r.voiceError
          ? error(r.voiceError)
          : "";
      } catch (e) {
        if (!signal.aborted) {
          $("#chat-error", el).innerHTML = error(e);
          if (selected) await open(selected);
        }
        throw e;
      }
    });
  };
  $("#load-models", el).onclick = (e) =>
    action(e.currentTarget, async () => {
      const rows = await api("/agent/models");
      $("#chat-model", el).innerHTML = rows.length
        ? (rows.some((m) => m.id === activeModel)
            ? ""
            : '<option value="">Choose a model</option>') +
          options(rows, activeModel)
        : '<option value="">Setup required: install or enable a model</option>';
    });
  $("#chat-model", el).onchange = (e) =>
    action(e.target, async () => {
      if (!e.target.value) return;
      await api("/agent/settings", { model: e.target.value });
      activeModel = e.target.value;
      notice("Active model updated");
    });
  const off = subscribe((e) => {
    if (e.type === "agent_message" && e.chatId === selected) open(selected);
  });
  await Promise.allSettled([
    list(),
    (async () => {
      try {
        const s = await api("/agent/settings");
        if (signal.aborted) return;
        $("#model-provider", el).textContent =
          s.provider + " / " + (s.model || "Setup required: select a model");
        activeModel = s.model;
        if (s.model)
          $("#chat-model", el).innerHTML = options([s.model], s.model);
      } catch (e) {
        if (!signal.aborted) $("#model-provider", el).textContent = e.message;
      }
    })(),
  ]);
  return () => {
    off();
    clearTimeout(searchTimer);
  };
}
