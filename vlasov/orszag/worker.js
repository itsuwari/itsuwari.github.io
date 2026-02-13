let modulePromise = null;
let pendingDeps = null;
let busy = false;
let baseUrl = null;
let assetSuffix = '';
let activeRun = null;

function send(msg) { postMessage(msg); }

function resolveBaseUrl() {
  if (baseUrl) return baseUrl;
  try {
    baseUrl = new URL('.', self.location.href).toString();
  } catch {
    baseUrl = '';
  }
  return baseUrl;
}

function resolveAssetSuffix() {
  if (assetSuffix) return assetSuffix;
  try {
    const url = new URL(self.location.href);
    const v = url.searchParams.get('v');
    assetSuffix = v ? ('?v=' + encodeURIComponent(v)) : '';
  } catch {
    assetSuffix = '';
  }
  return assetSuffix;
}

function moduleOptions(resolved, suffix, wasmBinary) {
  return {
    noInitialRun: true,
    locateFile: (path) => resolved + path + suffix,
    monitorRunDependencies: (left) => {
      if (pendingDeps === null) pendingDeps = left;
      if (pendingDeps && left >= 0) {
        const pct = Math.max(0, Math.min(1, 1 - left / pendingDeps));
        send({ type: 'loading', pct });
      }
      if (left === 0) send({ type: 'loading', pct: 1 });
    },
    print: (text) => {
      if (activeRun && activeRun.logs.length < 4096) {
        activeRun.logs.push({ level: 'stdout', text: String(text) });
      }
      send({ type: 'log', level: 'stdout', text });
    },
    printErr: (text) => {
      if (activeRun && activeRun.logs.length < 4096) {
        activeRun.logs.push({ level: 'stderr', text: String(text) });
      }
      send({ type: 'log', level: 'stderr', text });
    },
  };
}

function initModule() {
  if (!modulePromise) {
    const resolved = resolveBaseUrl();
    const suffix = resolveAssetSuffix();
    importScripts(resolved + 'alfven_wasm_embed.js' + suffix, resolved + 'alfven_wasm.js' + suffix);
    const embeddedBinary = globalThis.ALFVEN_WASM_BINARY || undefined;
    modulePromise = AlfvenModule(moduleOptions(resolved, suffix, embeddedBinary)).catch((err) => {
      if (!embeddedBinary) throw err;
      send({ type: 'log', level: 'stderr', text: 'Embedded wasm failed, retrying with network wasm...' });
      return AlfvenModule(moduleOptions(resolved, suffix, undefined));
    });
  }
  return modulePromise;
}

function clearSnapshots(mod, dir) {
  try {
    for (const name of mod.FS.readdir(dir)) {
      if (name === '.' || name === '..') continue;
      if (!name.endsWith('.dat')) continue;
      try { mod.FS.unlink(dir + '/' + name); } catch {}
    }
  } catch {
    // best effort
  }
}

function listSnapshotFiles(mod, dir) {
  const files = [];
  try {
    for (const name of mod.FS.readdir(dir)) {
      if (name === '.' || name === '..') continue;
      if (name.endsWith('.dat')) files.push(name);
    }
  } catch {
    return [];
  }
  files.sort();
  return files;
}

function readSnapshot(mod, dir, name) {
  try {
    return mod.FS.readFile(dir + '/' + name, { encoding: 'utf8' });
  } catch (err) {
    send({ type: 'log', level: 'stderr', text: `Snapshot read failed (${name}): ${err.message || err}` });
    return null;
  }
}

function classifyTermination(exitCode, logs) {
  const hay = (logs || []).map((x) => x && x.text ? x.text : '').join('\n');
  if (hay.includes('Blowup guard triggered')) {
    return { kind: 'blowup_guard', message: 'Blowup guard triggered.' };
  }
  if (hay.includes('Non-finite state detected')) {
    return { kind: 'non_finite', message: 'Non-finite state detected.' };
  }
  if (exitCode === 3) return { kind: 'blowup_guard', message: 'Blowup guard triggered.' };
  if (exitCode === 2) return { kind: 'non_finite', message: 'Non-finite state detected.' };
  if (exitCode === 0 || exitCode == null) return { kind: 'ok', message: '' };
  return { kind: 'exit_error', message: `Simulation exited (${exitCode}).` };
}

function ensureSnapshotDir(mod, dir) {
  if (!mod.FS.analyzePath(dir).exists) mod.FS.mkdir(dir);
}

function runOnce(mod, args, msg) {
  const runDir = '/snapshots';
  const snapshotCount = Math.max(1, msg.snapshotCount || 1);
  ensureSnapshotDir(mod, runDir);
  clearSnapshots(mod, runDir);

  const runArgs = args.slice();
  runArgs.push('--snapshot_dir', runDir);
  runArgs.push('--snapshot_count', String(snapshotCount));
  runArgs.push('--snapshot_field', 'jz');

  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  let exitCode = 0;
  try {
    const rc = mod.callMain(runArgs);
    if (typeof rc === 'number' && Number.isFinite(rc)) exitCode = rc;
  } catch (err) {
    if (err && typeof err.status === 'number') {
      exitCode = err.status;
    } else {
      throw err;
    }
  }
  const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

  const frames = [];
  for (const name of listSnapshotFiles(mod, runDir).slice(0, snapshotCount)) {
    const txt = readSnapshot(mod, runDir, name);
    if (txt) frames.push(txt);
  }

  return {
    frames,
    exitCode,
    runtimeSec: Math.max(0, (t1 - t0) / 1000.0),
  };
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type === 'init') {
    if (msg.baseUrl) baseUrl = msg.baseUrl;
    return;
  }
  if (msg.type !== 'run') return;
  if (!baseUrl && msg.baseUrl) baseUrl = msg.baseUrl;
  if (busy) {
    send({ type: 'error', runId: msg.runId, message: 'Worker already running' });
    return;
  }
  busy = true;
  try {
    activeRun = { runId: msg.runId, logs: [] };
    const mod = await initModule();
    const result = runOnce(mod, msg.args || [], msg);
    const term = classifyTermination(result.exitCode, activeRun.logs);
    const heap = mod.HEAPU8 || mod.HEAP8 || null;
    const heapBytes = heap && heap.buffer ? heap.buffer.byteLength : null;
    send({
      type: 'result',
      runId: msg.runId,
      frames: result.frames,
      heapBytes,
      exitCode: result.exitCode,
      runtimeSec: result.runtimeSec,
      terminationKind: term.kind,
      terminationMessage: term.message,
    });
  } catch (err) {
    send({ type: 'error', runId: msg.runId, message: err && err.message ? err.message : String(err) });
  } finally {
    activeRun = null;
    busy = false;
  }
};
