/** Controlled renderer inputs exercise independent network completion and stale responses. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

test('live quote renders before 24h reference; reference failure, timeout, empty and stale results stay independent', { timeout: 30000 }, async () => {
  const server = createServer(async (req, res) => {
    if (req.url === '/') return res.end('<div id="chart-root"></div>');
    if (!['/price-chart.mjs', '/shared.mjs'].includes(req.url)) { res.writeHead(404); return res.end(); }
    res.setHeader('content-type', 'text/javascript');
    res.end(await readFile(new URL('../renderer/ui' + req.url, import.meta.url)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => {
      const {mountChart} = await import('/price-chart.mjs');
      window.start = () => {
        window.chart?.dispose(); window.controller?.abort();
        window.controller = new AbortController();
        window.selected = { market:'SOL', kind:'spot', venue:'jupiter' };
        window.requests = [];
        window.chart = mountChart({root:document.querySelector('#chart-root'), signal:controller.signal, selection:()=>selected,
          api:(url, body, opts) => new Promise((resolve,reject) => {
            requests.push({url,resolve,reject});
            opts?.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true});
          })});
      };
      start();
      requests[1].resolve({quotes:[{price:82.87}]});
    });
    const header = page.locator('#market-head');
    await page.getByText('82.87 USD', {exact:true}).waitFor();
    assert.match(await header.textContent(), /24h reference · Loading/);
    await page.evaluate(()=>requests[2].reject(Error('GeckoTerminal rate limited (429)')));
    await page.getByText('24h reference · Unavailable: GeckoTerminal rate limited (429)',{exact:true}).waitFor();
    assert.equal(await page.locator('.market-price').textContent(),'82.87 USD');

    await page.evaluate(()=>{ start(); requests[2].resolve({candles:[{open:80}],source:'GeckoTerminal'}); requests[1].resolve({quotes:[{price:84}]}); });
    await page.waitForFunction(()=>document.querySelector('#market-head').textContent.includes('5 %'));
    await page.evaluate(()=>{ start(); requests[2].resolve({candles:[]}); requests[1].resolve({quotes:[{price:82.87}]}); });
    await page.getByText('24h reference · Unavailable: no candle',{exact:true}).waitFor();
    assert.equal(await page.locator('.market-price').textContent(),'82.87 USD');

    await page.evaluate(()=>{ start(); window.old=requests.slice(); selected={market:'BTC',kind:'spot',venue:'jupiter'}; chart.update(); old[1].resolve({quotes:[{price:999}]}); old[2].resolve({candles:[{open:1}]}); requests[4].resolve({quotes:[{price:100}]}); });
    await page.getByText('100 USD',{exact:true}).waitFor();
    assert.match(await header.textContent(), /BTC/);
    assert.doesNotMatch(await header.textContent(), /999|9,900/);

    await page.evaluate(()=>{ start(); requests[1].resolve({quotes:[{price:82.87}]}); });
    await page.getByText('24h reference · Timed out',{exact:true}).waitFor({timeout:10000});
    assert.equal(await page.locator('.market-price').textContent(),'82.87 USD');
    await page.evaluate(()=>{ start(); requests[1].reject(Error('Jupiter unavailable')); requests[2].resolve({candles:[{open:80}]}); });
    await page.getByText('Quote failed: Jupiter unavailable',{exact:true}).waitFor();
    assert.equal(await page.locator('.market-price').textContent(),'Unavailable');
    await page.evaluate(()=>{ start(); const old=requests.slice(); chart.dispose(); old[1].resolve({quotes:[{price:999}]}); old[2].resolve({candles:[{open:1}]}); });
    assert.equal(await page.locator('.market-price').textContent(),'Unavailable');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
});
