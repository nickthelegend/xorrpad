/** Real isolated HTTP server + SQLite + live venue reads. No intercepted APIs. */
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const dir = await mkdtemp(path.join(tmpdir(), "xorr-t5-ui-"));
process.env.XORR_USER_DATA = dir;
process.env.PAD_TOKEN = "xorrpad-ui-isolated-test";
const { createServer } = await import("../main/server.mjs");
const { Memory } = await import("../main/memory.mjs");
const mem = new Memory({ db: path.join(dir, "memory.db") }),
  server = createServer(mem);
const port = 8727,
  origin = `http://127.0.0.1:${port}`;
const output = fileURLToPath(
  new URL("../../docs/screens/v1/", import.meta.url),
);
await mkdir(output, { recursive: true });
let browser;
const issues = [],
  results = [],
  consoleErrors = [],
  checks = [],
  integrationScreenshots = [];
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  for (const route of ["/", "/classic", "/ui/app.mjs", "/ui/desk.css"])
    assert.equal((await fetch(origin + route)).status, 200, route);
  assert.equal((await fetch(origin + "/desk/link")).status, 401);
  const link = await fetch(origin + "/desk/link", {
    headers: { authorization: "Bearer " + process.env.PAD_TOKEN },
  });
  assert.equal(link.status, 200);
  assert.deepEqual((await link.json()).devices, []);
  checks.push("Public renderer/Classic/assets; authenticated device status");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  const base = origin + "/v1?token=" + process.env.PAD_TOKEN;
  async function settle() {
    const expected = new URL(page.url()).hash.slice(1) || "pad";
    await page
      .waitForFunction(
        (name) =>
          document.querySelector("#content").dataset.ready === name &&
          !document.querySelector("#content .loading"),
        expected,
        { timeout: 100000 },
      )
      .catch(() => {
        throw new Error("UI loading timed out");
      });
    await page.evaluate(() => document.fonts.ready);
  }
  // Verify a real keymap mutation, its persisted revision, and reserved-cell safety.
  await page.goto(base + "#pad");
  await settle();
  await page.locator('[data-action="grid"]').click();
  await page.getByRole("button", { name: "Save & push keymap" }).click();
  await page.getByRole("status").filter({ hasText: "Keymap saved" }).waitFor();
  const headers = {
    authorization: "Bearer " + process.env.PAD_TOKEN,
    "content-type": "application/json",
  };
  const saved = await (await fetch(origin + "/pad/keymap", { headers })).json();
  assert.equal(saved.keys[0].action, "grid");
  assert.equal(saved.revision, 1);
  assert.equal(
    (
      await fetch(origin + "/pad/keymap", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...saved,
          revision: 2,
          keys: saved.keys.map((k) =>
            k.action === "kill" ? { ...k, action: "grid" } : k,
          ),
        }),
      })
    ).status,
    400,
  );
  await page
    .locator('[data-action="dca"]')
    .dragTo(page.locator('[data-key="0"]'));
  assert.equal(
    await page.locator("#key-form [name=action]").inputValue(),
    "dca",
  );
  // Restore through the real endpoint to leave the screenshot state at the shipped map.
  const { DEFAULT_KEYMAP } = await import("../main/padlink.mjs");
  await fetch(origin + "/pad/keymap", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...DEFAULT_KEYMAP, revision: 2 }),
  });
  checks.push(
    "Key assignment persists through API; protected kill binding is refused",
  );
  // The authorized pad simulator exercises the real NDJSON transport and event stream.
  const helloResponse = await fetch(
    origin + "/padlink?device=t5-ui-simulator",
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/x-ndjson" },
      body:
        JSON.stringify({
          v: 1,
          type: "hello",
          device: "t5-ui-simulator",
          fw: "1.0.0",
        }) + "\n",
    },
  );
  assert.equal(helloResponse.status, 200);
  await page.locator(".tft .eyebrow").filter({ hasText: "1.0.0" }).waitFor();
  const liveLink = await (
    await fetch(origin + "/desk/link", { headers })
  ).json();
  assert.equal(liveLink.devices[0].firmware, "1.0.0");
  assert.equal(liveLink.devices[0].device, "t5-ui-simulator");
  const knobBefore = await page.locator(".knob-marker").getAttribute("style");
  const knobResponse = await fetch(origin + "/padlink?device=t5-ui-simulator", {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-ndjson" },
    body:
      JSON.stringify({ v: 1, type: "knob", id: "t9-knob", sizeUsd: 75 }) + "\n",
  });
  assert.equal(knobResponse.status, 200);
  await page.waitForFunction(
    (before) =>
      document.querySelector(".knob-marker").getAttribute("style") !== before,
    knobBefore,
  );
  assert.match(await page.locator(".tft").innerText(), /75/);
  const key = DEFAULT_KEYMAP.keys.find((k) => k.action === "portfolio");
  const keyRequest = fetch(origin + "/padlink?device=t5-ui-simulator", {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-ndjson" },
    body:
      JSON.stringify({
        v: 1,
        type: "key",
        id: "t9-key",
        edge: "down",
        action: "portfolio",
        row: key.row,
        col: key.col,
      }) + "\n",
  });
  await page.locator(".pad-key.pressed").waitFor();
  assert.notEqual(
    await page
      .locator(".pad-key.pressed")
      .evaluate((n) => getComputedStyle(n).transform),
    "none",
  );
  await keyRequest;
  checks.push(
    "Real NDJSON knob changes mirror angle and size; a read-only portfolio key visibly depresses",
  );
  for (const peer of server.padlink.peers)
    if (peer.device === "t5-ui-simulator") server.padlink.remove(peer);
  await page.getByText("NO PAD CONNECTED", { exact: true }).waitFor();
  checks.push(
    "Real NDJSON simulator hello appears in Pad TFT and authenticated link snapshot; disconnect clears it",
  );

  await page.goto(base + "#permissions");
  await settle();
  await page.locator("[name=maxTradeUsd]").fill("42");
  await page.getByRole("button", { name: "Save permission policy" }).click();
  await page.locator("#policy-result").filter({ hasText: "saved" }).waitFor();
  assert.equal(
    (await (await fetch(origin + "/permissions", { headers })).json())
      .maxTradeUsd,
    42,
  );
  checks.push("Permission cap round-trips through server");
  await page.goto(base + "#chats");
  await settle();
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await page.locator("#chat-controls").waitFor({ state: "visible" });
  await page.locator("#rename-chat input").fill("UI verification");
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page
    .locator("[data-chat]")
    .filter({ hasText: "UI verification" })
    .waitFor();
  await page.getByRole("button", { name: "Delete conversation" }).click();
  await page.getByText("Conversation deleted", { exact: true }).waitFor();
  assert.deepEqual(
    await (await fetch(origin + "/chats", { headers })).json(),
    [],
  );
  checks.push("Chat create, rename, delete use persisted conversation API");
  // Trade comparison is read-only and can return honest upstream/setup failures.
  await page.goto(base + "#trade");
  await settle();
  await page
    .getByRole("button", { name: "Compare routes", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.querySelector("#route-card .loading"),
    null,
    { timeout: 100000 },
  );
  assert.ok(await page.locator("#route-card").innerText());
  checks.push(
    "Live route comparison completes without submitting any proposal",
  );
  assert.equal(await page.locator("[data-period]").count(), 4);
  for (const period of ["1m", "15m", "1h", "1d"]) {
    await page.locator(`[data-period="${period}"]`).click();
    assert.equal(
      await page
        .locator(`[data-period="${period}"]`)
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.waitForFunction(
      () => !document.querySelector("#candle-state .loading"),
      null,
      { timeout: 100000 },
    );
    assert.ok(
      await page
        .locator(
          "#price-candles:visible,#candle-state .error,#candle-state .empty",
        )
        .count(),
    );
  }
  assert.equal(await page.locator("#market-head h2").innerText(), "SOL spot");
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("[data-spot]")].some(
        (n) => !n.textContent.includes("Fetching"),
      ),
    null,
    { timeout: 30000 },
  );
  assert.ok(
    !(await page.locator("#market-list").innerText()).includes(
      "Quote required",
    ),
  );
  const status = await (
    await fetch(origin + "/desk/status", { headers })
  ).json();
  assert.equal(status.wallet.mode, "phone");
  assert.ok(status.rpc.length === 2);
  assert.ok(
    status.rpc.every((r) =>
      ["mainnet-beta", "devnet", null, "unknown genesis"].includes(r.cluster),
    ),
  );
  assert.equal(status.autoAccept.enabled, false);
  await page
    .locator("#desk-status")
    .filter({ hasText: "Auto-accept OFF" })
    .waitFor();
  checks.push(
    "Four Pyth timeframe requests render real candles or honest source failure; visible spot rows quote live; verified cluster/budget status",
  );

  await page.locator(".skip").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement.id === "content");
  assert.equal(new URL(page.url()).hash, "#trade");
  checks.push("Skip link focuses workspace and preserves selected page");

  await page.goto(base + "#backtest");
  await settle();
  await page.locator("[name=kind]").selectOption("predict");
  assert.equal(await page.locator("[name=strike]").isVisible(), true);
  await page.locator("[name=kind]").selectOption("strategy");
  assert.equal(await page.locator("[name=strike]").isVisible(), false);
  checks.push("Backtest strategy/prediction fields adapt");
  await page.getByRole("button", { name: "Run backtest", exact: true }).click();
  await page.waitForFunction(
    () => !document.querySelector("#backtest-result .loading"),
    null,
    { timeout: 100000 },
  );
  assert.ok(
    await page
      .locator("#backtest-result .stats,#backtest-result .error")
      .count(),
  );
  checks.push(
    "Real T6 replay request renders results or upstream error without fabricated history",
  );

  await page.locator("#theme").selectOption("neon");
  await page.reload();
  await settle();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "neon");
  checks.push("Theme persists after reload");
  const pages = [
    "pad",
    "trade",
    "predict",
    "positions",
    "chats",
    "agent",
    "permissions",
    "backtest",
    "link",
  ];
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 812 });
    for (const name of pages) {
      for (const theme of ["floor", "paper", "neon"]) {
        await page.goto(base + "#" + name);
        await settle();
        // Use the actual theme control, including on collapsed phone navigation.
        if (width === 375) {
          await page.locator("#menu").click();
        }
        await page.locator("#theme").selectOption(theme);
        if (width === 375) {
          await page.locator("#menu").click();
        }
        if (name === "trade") {
          const firstSpot = page.locator("[data-spot]").first();
          if (await firstSpot.count()) {
            await firstSpot
              .locator("xpath=ancestor::tr")
              .scrollIntoViewIfNeeded();
            await page.waitForFunction(
              () =>
                !document
                  .querySelector("[data-spot]")
                  .textContent.includes("Fetching"),
              null,
              { timeout: 35000 },
            );
          }
        }
        const overflow = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        if (overflow.scroll > width)
          issues.push(
            `${name}/${theme}/${width}: horizontal overflow ${overflow.scroll}`,
          );
        const tiny = await page
          .locator(
            "#content button,#content input:not([type=checkbox]),#content select,#content a.button",
          )
          .evaluateAll((nodes) =>
            nodes
              .filter(
                (n) =>
                  n.getBoundingClientRect().width &&
                  n.getBoundingClientRect().height < 44,
              )
              .map((n) => n.textContent.trim() || n.getAttribute("name")),
          );
        const clipped = await page
          .locator(
            "#content input:not([type=checkbox]),#content textarea,#content select,#content button",
          )
          .evaluateAll((nodes) =>
            nodes
              .filter((n) => {
                const box = n.getBoundingClientRect(),
                  panel = n.closest(".panel")?.getBoundingClientRect();
                return (
                  box.width &&
                  panel &&
                  !n.closest(".table-wrap") &&
                  (box.right > panel.right - 8 || box.left < panel.left + 8)
                );
              })
              .map((n) => n.getAttribute("name") || n.textContent.trim()),
          );
        if (clipped.length)
          issues.push(
            `${name}/${theme}/${width}: clipped controls ${clipped.join(", ")}`,
          );
        if (tiny.length)
          issues.push(
            `${name}/${theme}/${width}: targets below 44px ${tiny.join(", ")}`,
          );
        await page.evaluate(() => {
          document.activeElement?.blur();
          window.scrollTo(0, 0);
        });
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        for (const state of await page.locator(".empty").all()) {
          assert.equal(await state.locator(".empty-art").count(), 1);
          assert.equal(
            await state.locator(".actions button,.actions a.button").count(),
            1,
          );
          assert.match(await state.innerText(), /Setup required:/);
        }
        const filename = `${name}-${theme}-${width}.png`;
        await page.screenshot({
          path: path.join(output, filename),
          fullPage: true,
        });
        results.push({
          page: name,
          theme,
          width,
          file: filename,
          states: await page.locator(".error,.empty strong").allTextContents(),
        });
        console.log(`Captured ${filename}`);
      }
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(base + "#pad");
  await settle();
  await page.locator("#menu").click();
  assert.equal(
    await page.locator("#menu").getAttribute("aria-expanded"),
    "true",
  );
  await page.getByRole("link", { name: "Permissions", exact: true }).click();
  await page.locator("#rail").waitFor({ state: "hidden" });
  await settle();
  assert.equal(await page.locator("#rail").isVisible(), false);
  checks.push("375px navigation collapses after selection");
  await page.goto(base + "#pad");
  await settle();
  const candidates = await (
    await fetch(origin + "/pm/markets", { headers })
  ).json();
  const candidate = candidates.markets?.find(
    (m) => m.liquidity > 10 && m.yesPrice > 0.1 && m.yesPrice < 0.9,
  );
  if (candidate) {
    const actionId = `pmamm:${candidate.market}:yes`;
    await mem.setReference("risk/limits", {
      allow: [actionId],
      max_trade_usd: 1,
      max_day_usd: 10,
    });
    await fetch(origin + "/padlink?device=t5-ui-simulator", {
      method: "POST",
      headers: { ...headers, "content-type": "application/x-ndjson" },
      body:
        JSON.stringify({
          v: 1,
          type: "hello",
          device: "t5-ui-simulator",
          fw: "1.0.0",
        }) + "\n",
    });
    const proposal = await (
      await fetch(origin + "/signals", {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind: "predict",
          market: candidate.market,
          side: "yes",
          size: 1,
        }),
      })
    ).json();
    if (proposal.signalState === "awaiting") {
      await page.locator(".tft").filter({ hasText: "Press ✓ / ✗" }).waitFor();
      await page.goto(base + "#chats");
      await settle();
      await page
        .locator("#signal-toast")
        .filter({ hasText: "Decision waiting" })
        .waitFor();
      await mkdir(path.join(output, "evidence"), { recursive: true });
      await page.screenshot({
        path: path.join(output, "evidence/signal-toast-chats-375.png"),
        fullPage: true,
      });
      integrationScreenshots.push("evidence/signal-toast-chats-375.png");
      await page.locator("#view-signals").click();
      await page.locator("#signal-drawer [data-countdown]").waitFor();
      assert.ok(await page.locator("#signal-drawer [data-accept]").count());
      await page.screenshot({
        path: path.join(output, "evidence/signal-drawer-chats-375.png"),
        fullPage: true,
      });
      integrationScreenshots.push("evidence/signal-drawer-chats-375.png");
      await page.locator("#close-signals").click();
      await page.goto(base + "#pad");
      await settle();
      await page.locator("#dismiss-signal").click();
      await page.screenshot({
        path: path.join(output, "evidence/pad-confirm-375.png"),
        fullPage: true,
      });
      integrationScreenshots.push("evidence/pad-confirm-375.png");
      const noKey = saved.keys.findIndex((k) => k.action === "no");
      await page.locator(`[data-key="${noKey}"]`).click();
      await page.waitForFunction(
        () =>
          !document.querySelector(".tft").textContent.includes("Press ✓ / ✗"),
      );
      checks.push(
        "Real devnet signal appears globally on Chats with countdown and Accept/Refuse; pad mirror Refuse uses same endpoint and clears TFT; no signing",
      );
    } else
      checks.push(
        "Devnet proposal gate reported " +
          proposal.signalState +
          "; no signing",
      );
  } else
    checks.push(
      "Live devnet proposal check unavailable: no liquid open market returned",
    );
  // Unauthenticated public demo renders a designed setup state and no private data.
  await page.goto(origin + "/v1#pad");
  await settle();
  assert.match(
    await page.locator("#content").innerText(),
    /Setup required: connect with your pad token/,
  );
  checks.push("Unauthenticated demo shows setup-required state");
  assert.deepEqual(consoleErrors, [], "Browser runtime errors");
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        origin: "isolated real server on loopback 8727",
        data: "Live venue reads, empty isolated SQLite and app state; no mocked responses. One quote-backed devnet proposal may be created and refused to check the TFT; no transaction signed or submitted.",
        checks,
        issues,
        runtimeErrors: consoleErrors,
        integrationScreenshots,
        screenshots: results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      screenshots: results.length,
      checks: checks.length,
      issues,
      runtimeErrors: consoleErrors,
    }),
  );
  assert.deepEqual(issues, []);
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  mem.stop();
  await rm(dir, { recursive: true, force: true });
}
