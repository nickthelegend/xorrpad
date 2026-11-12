/** D4: actual authenticated desk + encrypted native padsim, no intercepted APIs. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { SessionPadSimulator } from '../../tools/padsim/session.mjs';

const dir = await mkdtemp(path.join(tmpdir(), 'xorr-d4-'));
process.env.XORR_USER_DATA = dir;
process.env.PAD_TOKEN = 'isolated-d4-browser-test';
const { createServer } = await import('../main/server.mjs');
const { Memory } = await import('../main/memory.mjs');
const headers = { authorization: 'Bearer isolated-d4-browser-test', 'content-type': 'application/json' };
const output = fileURLToPath(new URL('../../docs/screens/v3/', import.meta.url));
let server, mem, origin;
async function until(fn) {
  for (let i = 0; i < 500; i++) { if (fn()) return; await delay(10); }
  throw Error('D4 encrypted padsim timed out');
}
async function pair(pad, port) {
  await pad.listen(port);
  const peer = server.padlink.attach(net.createConnection(port, '127.0.0.1').setNoDelay(true), 'usb');
  await until(() => peer.candidate);
  server.padlink.pair(pad.pairing);
  await until(() => peer.verified && pad.verified);
  return peer;
}
async function capture(page, screen, state, area) {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  if (await dismiss.count()) await dismiss.click();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${screen} ${state} ${width} overflow`);
    for (const control of await area.locator('button, input:not([type=checkbox]), label.check, select, a.button').all()) {
      const box = await control.boundingBox();
      if (box) assert.ok(box.height >= 44, `${screen} ${state}: ${await control.getAttribute('name')} tap target ${box.height}`);
    }
    await page.screenshot({ path: path.join(output, `${screen}-${state}-${width}.png`), fullPage: true, animations: 'disabled' });
  }
}
before(async () => {
  await mkdir(output, { recursive: true });
  mem = new Memory({ db: path.join(dir, 'memory.db') }); server = createServer(mem);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.padlink.close(); server.signals.close();
  await new Promise((resolve) => server.close(resolve)); mem.stop();
  await rm(dir, { recursive: true, force: true });
});

test('Agent selects native pad signer, approves session caps, reports spend and requires explicit blind opt-in', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const pad = new SessionPadSimulator({ device: 'esp32-d4abcdef1234', serial: true, sessionStateFile: path.join(dir, 'public-accounting.json') });
  let other;
  try {
    await page.goto(origin + '/?token=isolated-d4-browser-test#agent');
    const wallet = page.locator('.wallet-settings'); await wallet.locator('summary').click();
    await wallet.getByRole('heading', { name: 'No pad connected', exact: true }).waitFor();
    await capture(page, 'agent', 'empty', wallet);
    const peer = await pair(pad, 8726);
    await wallet.getByText('Rolling daily spend: 0 USD.', { exact: true }).waitFor();
    assert.equal(await wallet.getByRole('checkbox', { name: 'Allow blind signing' }).isChecked(), false);
    await wallet.getByRole('button', { name: 'Use pad signer', exact: true }).click();
    await wallet.getByText('Signing mode: pad', { exact: true }).waitFor();
    await wallet.getByText('Pad signer uses the public key and policy reported below.', { exact: true }).waitFor();
    await wallet.getByRole('button', { name: 'Edit pad session policy', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Pad session policy' });
    await sheet.getByLabel('Per-trade cap (USD)', { exact: true }).fill('0.2');
    await sheet.getByLabel('Per-day cap (USD)', { exact: true }).fill('0.24');
    await sheet.getByLabel('Approved dollar asset mint').fill('3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ');
    await sheet.getByLabel('Venue allowlist (program public keys)').fill('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    await capture(page, 'agent', 'policy', sheet);
    await sheet.getByRole('button', { name: 'Review policy on pad', exact: true }).click();
    await until(() => pad.policyRequest);
    assert.deepEqual(pad.policyRequest.policy, { trade: 200000, day: 240000, autoTrade: 0, maxLeverage: 1, mint: '3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ', market: '', programs: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'] });
    await pad.approvePolicy(3799);
    await sheet.getByText('policy refused', { exact: true }).waitFor();
    await sheet.getByRole('button', { name: 'Review policy on pad', exact: true }).click();
    await until(() => pad.policyRequest); await pad.approvePolicy();
    await wallet.getByText('Session policy approved by the pad.', { exact: true }).waitFor();
    await wallet.getByText('Policy approved on pad.', { exact: true }).waitFor();
    const fixture = JSON.parse(await readFile(new URL('../../firmware/test/fixtures/session-usdc-transfer.json', import.meta.url)));
    // The real SDK/native signer test separately verifies signatures. Here the same
    // captured message proves that readback comes from actual firmware accounting.
    const { PublicKey, Transaction, VersionedTransaction } = await import('@solana/web3.js');
    const { createTransferCheckedInstruction, getAssociatedTokenAddressSync } = await import('@solana/spl-token');
    const captured = VersionedTransaction.deserialize(Buffer.from(fixture.unsignedTx, 'base64'));
    const owner = new PublicKey((await pad.driver.call({ command: 'status' })).publicKey);
    const mint = captured.message.staticAccountKeys[captured.message.compiledInstructions[0].accountKeyIndexes[1]];
    const destination = captured.message.staticAccountKeys[captured.message.compiledInstructions[0].accountKeyIndexes[2]];
    const tx = new Transaction({ feePayer: owner, recentBlockhash: captured.message.recentBlockhash }).add(createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, owner, true), mint, destination, owner, 123456n, 6));
    const v = VersionedTransaction.deserialize(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
    await pad.driver.call({ command: 'prepare', request: { signalId: 'd4-spend', remainingMs: 120000, message: Buffer.from(v.message.serialize()).toString('hex'), tables: [], sign: true } });
    assert.equal((await pad.driver.call({ command: 'sign', reviewed: true, heldMs: 800 })).ok, true);
    await wallet.getByRole('button', { name: 'Read pad session', exact: true }).click();
    await wallet.getByText('Rolling daily spend: 0.12 USD.', { exact: true }).waitFor();
    await capture(page, 'agent', 'approved', wallet);
    await wallet.getByRole('checkbox', { name: 'Allow blind signing' }).check();
    assert.equal(server.padlink.options.allowBlindSigning, false);
    await wallet.getByRole('button', { name: 'Save blind signing setting', exact: true }).click();
    await until(() => server.padlink.options.allowBlindSigning);
    await wallet.getByRole('checkbox', { name: 'Allow blind signing' }).uncheck();
    await wallet.getByRole('button', { name: 'Save blind signing setting', exact: true }).click();
    await until(() => !server.padlink.options.allowBlindSigning);
    other = new SessionPadSimulator({ device: 'esp32-d4fedcba4321', serial: true, sessionStateFile: path.join(dir, 'other-public.json') });
    await pair(other, 8728);
    await wallet.getByLabel('Signer pad', { exact: true }).selectOption(other.device);
    await wallet.getByText('Setup required: approve signing policy on pad', { exact: true }).waitFor();
    await wallet.getByLabel('Signer pad', { exact: true }).selectOption(pad.device);
    await wallet.getByText('Policy approved on pad.', { exact: true }).waitFor();
    peer.close(); await pad.close();
    await wallet.getByRole('heading', { name: 'Selected pad disconnected', exact: true }).waitFor();
    assert.equal(await wallet.getByRole('button', { name: 'Use pad signer', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await pad.close(); await other?.close(); }
});

test('Activity renders actual clear-sign results, retained events, crew policy and independent native rounds', { timeout: 180000 }, async (t) => {
  const { CrewPadSimulator } = await import('../../tools/padsim/crew.mjs');
  const { clearSignFrames } = await import('../main/clear-sign.mjs');
  const { VersionedTransaction } = await import('@solana/web3.js');
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const pad = new SessionPadSimulator({ device: 'esp32-d4review1234', serial: true, sessionStateFile: path.join(dir, 'review-public.json') });
  const crewPads = [new CrewPadSimulator({ device: 'crew-d4-alpha', serial: true }), new CrewPadSimulator({ device: 'crew-d4-beta', serial: true })];
  try {
    await page.goto(origin + '/?token=isolated-d4-browser-test#activity');
    const area = page.getByRole('region', { name: 'Pad activity', exact: true });
    await area.getByRole('heading', { name: 'No pad connected', exact: true }).waitFor();
    await capture(page, 'activity', 'empty', area);
    await pair(pad, 8726);
    await area.getByRole('button', { name: 'Review unsigned transaction on pad', exact: true }).click();
    let sheet = page.getByRole('dialog', { name: 'Clear-sign review', exact: true });
    await sheet.getByLabel('Unsigned transaction (base64)', { exact: true }).fill('invalid');
    await sheet.getByRole('button', { name: 'Send review to pad', exact: true }).click();
    await sheet.locator('[role=alert]').waitFor();
    await capture(page, 'activity', 'error', sheet);
    const fixture = JSON.parse(await readFile(new URL('../../firmware/test/fixtures/system-legacy.json', import.meta.url)));
    await sheet.getByLabel('Unsigned transaction (base64)', { exact: true }).fill(fixture.unsignedTx);
    const response = page.waitForResponse((r) => r.url().endsWith('/pad/clear-sign') && r.request().method() === 'POST');
    await sheet.getByRole('button', { name: 'Send review to pad', exact: true }).click();
    const r = await response;
    if (r.status() === 202) {
      await until(() => pad.review); await pad.approveReview({ yes: false });
      await area.getByRole('heading', { name: 'Review refused', exact: true }).waitFor();
      await area.getByText('refused on pad', { exact: true }).waitFor();
      await area.getByText(/System transfer/, { exact: false }).first().waitFor();
      await area.getByRole('button', { name: 'Review unsigned transaction on pad', exact: true }).click();
      sheet = page.getByRole('dialog', { name: 'Clear-sign review', exact: true });
      await sheet.getByLabel('Unsigned transaction (base64)', { exact: true }).fill(fixture.unsignedTx);
      pad.review = null;
      await sheet.getByRole('button', { name: 'Send review to pad', exact: true }).click();
      await until(() => pad.review); await pad.approveReview();
      await area.getByRole('heading', { name: 'Review approved', exact: true }).waitFor();
      // A signed result must originate from a real native firmware signature and
      // encrypted correlated response, never a fabricated WebSocket event.
      const signedFixture = JSON.parse(await readFile(new URL('../../firmware/test/fixtures/session-usdc-transfer.json', import.meta.url)));
      const { PublicKey, Transaction } = await import('@solana/web3.js');
      const { createTransferCheckedInstruction, getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      const owner = new PublicKey((await pad.driver.call({ command: 'status' })).publicKey);
      const captured = VersionedTransaction.deserialize(Buffer.from(signedFixture.unsignedTx, 'base64'));
      const mint = captured.message.staticAccountKeys[captured.message.compiledInstructions[0].accountKeyIndexes[1]];
      const destination = captured.message.staticAccountKeys[captured.message.compiledInstructions[0].accountKeyIndexes[2]];
      await pad.driver.call({ command: 'policy', heldMs: 3800, policy: { trade: 200000, day: 240000, autoTrade: 0, maxLeverage: 1, mint: mint.toBase58(), market: '', programs: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'] } });
      const tx = new Transaction({ feePayer: owner, recentBlockhash: captured.message.recentBlockhash }).add(createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, owner, true), mint, destination, owner, 123456n, 6));
      const v = VersionedTransaction.deserialize(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
      const prepared = clearSignFrames({ signalId: 'd4-actual-signature', remainingMs: 120000, message: Buffer.from(v.message.serialize()).toString('hex'), tables: [], sign: true });
      const peer = server.padlink.sessionPeer(pad.device);
      pad.review = null;
      const signing = server.padlink.waitSession(peer, { type: 'session_signature', signalId: 'd4-actual-signature', messageHash: prepared.messageHash }, () => { for (const frame of prepared.frames) server.padlink.send(peer, frame); });
      await until(() => pad.review); await pad.approveSign(); assert.equal((await signing).ok, true);
      await area.getByRole('heading', { name: 'Signed on pad', exact: true }).waitFor();
      await capture(page, 'activity', 'clear-results', area);
      await page.evaluate(() => { location.hash = 'markets'; });
      // Hash navigation retains Provider history; a page reload honestly starts
      // another desktop event session.
      await page.evaluate(() => { location.hash = 'activity'; });
      await area.getByRole('heading', { name: 'Signed on pad', exact: true }).waitFor();
      await page.reload();
      await page.getByText('No clear-sign results received in this desktop session.', { exact: true }).waitFor();
    } else {
      const error = (await r.json()).error;
      assert.match(error, /fetch failed|timeout|429|503|RPC/i);
      t.diagnostic('Public devnet RPC unavailable: ' + error + '; native crew coverage still runs.');
      await sheet.getByRole('button', { name: 'Close sheet', exact: true }).click();
    }
    await pair(crewPads[0], 8727); await pair(crewPads[1], 8728);
    await until(() => server.padlink.snapshot().devices.length === 3);
    await area.getByRole('button', { name: 'Edit crew policy', exact: true }).click();
    sheet = page.getByRole('dialog', { name: 'Crew co-sign policy', exact: true });
    // Wait for the real link read to include both identities before editing.
    if (!(await sheet.locator('[name=member]').count() >= 2)) {
      await sheet.getByRole('button', { name: 'Close sheet', exact: true }).click();
      await delay(3100); await area.getByRole('button', { name: 'Edit crew policy', exact: true }).click();
    }
    await sheet.getByLabel('Require crew approvals', { exact: true }).selectOption('true');
    await sheet.getByLabel('For trades above (USD)', { exact: true }).fill('25');
    for (const crewPad of crewPads) await sheet.locator(`[name=member][value="${crewPad.device}"]`).check();
    await capture(page, 'activity', 'crew-policy', sheet);
    await sheet.getByRole('button', { name: 'Save crew policy', exact: true }).click();
    await area.getByText('Above 25 USD, require 2 crew approvals.', { exact: true }).waitFor();
    const f = JSON.parse(await readFile(new URL('../../firmware/test/fixtures/session-usdc-transfer.json', import.meta.url)));
    const tx = VersionedTransaction.deserialize(Buffer.from(f.unsignedTx, 'base64'));
    const roundId = 'd4-native-crew-round';
    const prepared = clearSignFrames({ signalId: roundId, remainingMs: 120000, message: f.message, tables: [], cosign: true });
    const collecting = server.executor.crew.collect(tx, { usd: 26, signalId: roundId, expiresAt: Date.now() + 120000, cluster: 'devnet', recheck: async () => {}, prepared: { ...prepared, request: { signalId: roundId, remainingMs: 120000, cosign: true } } });
    await until(() => crewPads.every((p) => p.review));
    for (const crewPad of crewPads) await crewPad.approveCrew();
    assert.equal((await collecting).approvals.length, 2);
    await area.getByRole('heading', { name: roundId + ' · approved', exact: true }).waitFor();
    await area.getByText('2 of 2 approvals · crew-d4-alpha, crew-d4-beta', { exact: true }).waitFor();
    assert.equal(await area.getByRole('heading', { name: 'Signed on pad', exact: true }).count(), 0, 'Crew approvals cannot become wallet signatures');
    await capture(page, 'activity', 'crew-approved', area);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await pad.close(); for (const p of crewPads) await p.close(); }
});

test('Markets saves native-backed pad alerts, preserves other rules, removes and never trades', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [], writes = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.method() === 'POST') writes.push(new URL(r.url()).pathname); });
  const pad = new SessionPadSimulator({ device: 'esp32-d4alerts123', serial: true, sessionStateFile: path.join(dir, 'alerts-public.json') });
  let other;
  try {
    await page.goto(origin + '/?token=isolated-d4-browser-test#markets');
    await page.getByRole('button', { name: 'Alert on pad', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Alert on pad · SOL', exact: true });
    await sheet.getByRole('heading', { name: 'No pad connected', exact: true }).waitFor();
    await capture(page, 'markets', 'alert-empty', sheet);
    const peer = await pair(pad, 8726);
    await sheet.getByText('No price alerts stored on this pad.', { exact: true }).waitFor();
    assert.equal(await sheet.getByLabel('Alert token mint', { exact: true }).inputValue(), 'So11111111111111111111111111111111111111112');
    await sheet.getByLabel('Alert price (USD)', { exact: true }).fill('100');
    await sheet.getByLabel('Alert direction', { exact: true }).selectOption('above');
    await sheet.getByRole('button', { name: 'Save alert on pad', exact: true }).click();
    await sheet.getByRole('heading', { name: 'At or above 100 USD', exact: true }).waitFor();
    await sheet.getByLabel('Alert direction', { exact: true }).selectOption('below');
    await sheet.getByLabel('Alert price (USD)', { exact: true }).fill('90');
    await sheet.getByRole('button', { name: 'Save alert on pad', exact: true }).click();
    await sheet.getByRole('heading', { name: 'At or below 90 USD', exact: true }).waitFor();
    const stored = await server.padlink.priceAlerts(pad.device);
    assert.deepEqual(stored.alerts.map(({ usd, above }) => ({ usd, above })), [{ usd: 100, above: true }, { usd: 90, above: false }]);
    await capture(page, 'markets', 'alerts-stored', sheet);
    // Invalid-rule error uses the authenticated real route; nothing is intercepted.
    const invalid = await fetch(origin + '/pad/price-alerts', { method: 'POST', headers, body: JSON.stringify({ device: pad.device, alerts: [{ ...stored.alerts[0], action: 'buy' }] }) });
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error, 'invalid price alert');
    await sheet.getByRole('button', { name: 'Remove alert ' + stored.alerts[0].id, exact: true }).click();
    await sheet.getByText('1 of 8 alerts stored on this pad. Saving changes re-arms the remaining alerts.', { exact: true }).waitFor();
    assert.equal((await server.padlink.priceAlerts(pad.device)).alerts[0].id, stored.alerts[1].id);
    other = new SessionPadSimulator({ device: 'esp32-d4alerts456', serial: true, sessionStateFile: path.join(dir, 'alerts-other-public.json') });
    await pair(other, 8728);
    await sheet.getByLabel('Alert pad', { exact: true }).selectOption(other.device);
    await sheet.getByText('No price alerts stored on this pad.', { exact: true }).waitFor();
    await sheet.getByLabel('Alert pad', { exact: true }).selectOption(pad.device);
    await sheet.getByRole('heading', { name: 'At or below 90 USD', exact: true }).waitFor();
    peer.close(); await pad.close();
    await sheet.getByRole('heading', { name: 'Selected pad disconnected', exact: true }).waitFor();
    assert.equal(await sheet.getByRole('button', { name: 'Save alert on pad', exact: true }).count(), 0);
    assert.ok(writes.every((p) => p === '/pad/price-alerts'), 'Alert UI must not propose, sign, or trade');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await pad.close(); await other?.close(); }
});
