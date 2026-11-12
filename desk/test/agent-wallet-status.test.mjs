/** Concurrent public wallet/policy reads use one encrypted native-pad request. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { SessionPadSimulator } from '../../tools/padsim/session.mjs';
import { PadLink } from '../main/padlink.mjs';
import { Executor } from '../main/executor.mjs';
import { SignalQueue } from '../main/signals.mjs';
async function until(fn) { for (let i = 0; i < 500; i++) { if (fn()) return; await delay(10); } throw Error('pairing timeout'); }
test('concurrent agent identity and session status share a fresh read, preserve exclusive approval and reject together on disconnect', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'xorr-w3-status-'));
  const signals = new SignalQueue(), link = new PadLink({ dir, signals });
  const pad = new SessionPadSimulator({ device: 'wallet-status-pad', serial: true, sessionStateFile: path.join(dir, 'public-accounting.json') });
  try {
    await pad.listen(8725);
    const peer = link.attach(net.createConnection(8725, '127.0.0.1'), 'usb');
    await until(() => peer.candidate); link.pair(pad.pairing); await until(() => peer.verified && pad.verified);
    const executor = new Executor({ dir, signals }); executor.setPadLink(link); executor.setMode('pad', pad.device);
    const after = pad.history.length;
    const first = link.sessionStatus(pad.device), second = link.sessionStatus(pad.device);
    assert.equal(first, second, 'public readers share the same in-flight promise');
    const identity = executor.agentWalletIdentity();
    assert.throws(() => link.configureSession(pad.device, {}), /pad busy/);
    const [a, b, wallet] = await Promise.all([first, second, identity]);
    assert.equal(a.publicKey, b.publicKey); assert.deepEqual(wallet, { address: a.publicKey, source: 'pad' });
    assert.equal(pad.history.slice(after).filter(m => m.type === 'session_status').length, 1);
    assert.equal(peer.sessionStatusRead, undefined);
    // A mutation/approval cannot be shared as if it were a read.
    const approval = link.configureSession(pad.device, {});
    assert.throws(() => link.sessionStatus(pad.device), /pad busy/);
    await until(() => pad.policyRequest); await pad.approvePolicy(0);
    await assert.rejects(approval, /policy|invalid|refused/);
    const fresh = link.sessionStatus(pad.device); assert.notEqual(fresh, first); await fresh;
    const pending = link.sessionStatus(pad.device), shared = link.sessionStatus(pad.device);
    const settled = Promise.allSettled([pending, shared]); link.remove(peer);
    assert.ok((await settled).every(r => r.status === 'rejected' && /disconnected/.test(r.reason.message)));
    assert.equal(peer.sessionStatusRead, undefined);
  } finally { link.close(); signals.close(); await pad.close(); await rm(dir, { recursive: true, force: true }); }
});
