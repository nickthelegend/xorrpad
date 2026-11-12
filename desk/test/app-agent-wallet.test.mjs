/** Actual built desktop, authenticated routes, public devnet RPC and TCP padsim. No API interception. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PadSimulator } from '../../tools/padsim/index.mjs';
import { assertReadableLayout } from './app-v3-layout.mjs';

process.env.PAD_TOKEN = 'isolated-w3-browser-test';
process.env.SOLANA_RPC = 'https://api.devnet.solana.com';
delete process.env.SOLANA_ADDRESS;
const { createServer } = await import('../main/server.mjs');
const { Memory } = await import('../main/memory.mjs');
const output = new URL('../../docs/screens/v3/', import.meta.url);

test('Agent wallet creates once, copies its address, decodes its live QR, shows balances and delivers Fund to a pad at both widths', { timeout: 180000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'xorr-w3-browser-'));
  process.env.XORR_USER_DATA = dir;
  const mem = new Memory({ db: path.join(dir, 'memory.db') }), server = createServer(mem);
  const pad = new PadSimulator({ fragmentBytes: 7 });
  let browser, stream, heartbeat;
  try {
    await mkdir(output, { recursive: true });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
    const context = await browser.newContext({ reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/?token=isolated-w3-browser-test#agent');
    const card = page.getByRole('region', { name: 'Agent wallet', exact: true });
    await card.getByRole('button', { name: 'Create agent wallet', exact: true }).waitFor();
    assert.equal(await card.locator('img[alt*="funding QR"]').count(), 0);
    assert.equal(await card.getByRole('button', { name: 'Show QR on pad', exact: true }).count(), 0);
    await card.getByRole('button', { name: 'Create agent wallet', exact: true }).click();
    await card.locator('[data-wallet-address]').waitFor({ timeout: 60000 });
    const address = await card.locator('[data-wallet-address]').textContent();
    assert.equal(address, (await server.executor.wallet.info()).publicKey);
    assert.equal(await card.getByRole('button', { name: 'Create agent wallet', exact: true }).count(), 0);
    assert.match(await card.textContent(), /Balances · devnet/);
    assert.match(await card.textContent(), /Devnet tokens have no USD market value/);
    // Fresh disposable identity has actual zero SOL and USDC on devnet.
    assert.deepEqual(await card.locator('dt').allTextContents(), ['SOL', 'USDC']);
    assert.deepEqual(await card.locator('dd > span').allTextContents(), ['0', '0']);
    await card.getByRole('button', { name: 'Copy address', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), address);
    const qr = await card.locator('img[alt*="funding QR"]').evaluate(async img => {
      await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 444;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 444, 444);
      return Array.from(ctx.getImageData(0, 0, 444, 444).data);
    });
    assert.equal(jsQR(new Uint8ClampedArray(qr), 444, 444)?.data, `solana:${address}?label=xorrpad%20agent`);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      await card.scrollIntoViewIfNeeded();
      await card.evaluate(node => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 24));
      const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
      if (await dismiss.count()) await dismiss.click();
      await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const bounds = await card.boundingBox();
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height < 920, 'Whole wallet card stays above the mobile navigation');
      await assertReadableLayout(page, card, `Agent wallet ${width}`);
      for (const button of await card.getByRole('button').all()) {
        const box = await button.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44);
      }
      await page.screenshot({ path: fileURLToPath(new URL(`agent-wallet-devnet-${width}.png`, output)), animations: 'disabled' });
    }
    await delay(10000);
    await card.getByRole('button', { name: 'Show QR on pad', exact: true }).click();
    await card.getByRole('alert').filter({ hasText: 'Connect your pad' }).waitFor({ timeout: 30000 });
    await pad.listen(8727);
    stream = net.createConnection(8727, '127.0.0.1'); server.padlink.attach(stream, 'tcp');
    await pad.waitFor(m => m.type === 'keymap'); heartbeat = setInterval(() => pad.hello(), 5000);
    await delay(10000);
    await card.getByRole('button', { name: 'Show QR on pad', exact: true }).click();
    const record = await pad.waitFor(m => m.type === 'fund');
    assert.equal(record.address, address); assert.equal(record.cluster, 'devnet');
    assert.equal(record.uri, `solana:${address}?label=xorrpad%20agent`);
    await page.getByRole('status').filter({ hasText: 'Funding QR sent to 1 pad.' }).waitFor();
    await writeFile(new URL('../../firmware/build/w3-fund-devnet.json', import.meta.url), JSON.stringify(record, null, 2));
    // Fail the actual RPC, then refresh: no stale/fabricated balance or Create action.
    process.env.SOLANA_RPC = 'http://127.0.0.1:1';
    await card.getByRole('button', { name: 'Refresh', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('.agent-wallet button').disabled);
    await card.getByRole('button', { name: 'Refresh', exact: true }).click();
    await card.getByRole('alert').filter({ hasText: 'Agent wallet unavailable' }).waitFor();
    assert.equal(await card.locator('dd').count(), 0);
    assert.equal(await card.locator('img[alt*="funding QR"]').count(), 0);
    assert.equal(await card.getByRole('button', { name: 'Create agent wallet', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    clearInterval(heartbeat); stream?.destroy(); await pad.close(); await browser?.close();
    server.padlink.close(); server.signals.close();
    await new Promise(r => server.close(r)); mem.stop(); delete process.env.XORR_USER_DATA;
    await rm(dir, { recursive: true, force: true });
  }
});
