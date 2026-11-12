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
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${screen} ${state} ${width} overflow`);
    for (const control of await area.locator('button, input:not([type=checkbox]), select, a.button').all()) {
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
