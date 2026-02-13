let modulePromise = null;
let pendingDeps = null;
let busy = false;
let baseUrl = null;
let activeRun = null;
let assetSuffix = '';

function send(msg) {
  postMessage(msg);
}

function resolveBaseUrl() {
  if (baseUrl) return baseUrl;
  try {
    baseUrl = new URL('.', self.location.href).toString();
  } catch (err) {
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
  } catch (err) {
    assetSuffix = '';
  }
  return assetSuffix;
}

function isImportLinkError(err) {
  const text = String(err && err.message ? err.message : err || '');
  return text.includes('function import requires a callable') || text.includes('WebAssembly.instantiate()');
}

function moduleOptions(resolved, suffix, wasmBinary) {
  const opts = {
    noInitialRun: true,
    locateFile: (path) => resolved + path + suffix,
    monitorRunDependencies: (left) => {
      if (pendingDeps === null) pendingDeps = left;
      if (pendingDeps && left >= 0) {
        const progress = 1 - left / pendingDeps;
        const pct = Math.max(0, Math.min(1, progress));
        send({ type: 'loading', pct });
      }
      if (left === 0) {
        send({ type: 'loading', pct: 1 });
      }
    },
    print: (text) => {
      if (activeRun && activeRun.logs.length < 4096) activeRun.logs.push({ level: 'stdout', text: String(text) });
      send({ type: 'log', level: 'stdout', text });
    },
    printErr: (text) => {
      if (activeRun && activeRun.logs.length < 4096) activeRun.logs.push({ level: 'stderr', text: String(text) });
      send({ type: 'log', level: 'stderr', text });
    },
  };
  if (wasmBinary) opts.wasmBinary = wasmBinary;
  return opts;
}

function initModule() {
  if (!modulePromise) {
    const resolved = resolveBaseUrl();
    const suffix = resolveAssetSuffix();
    importScripts(resolved + 'alfven_wasm_embed.js' + suffix, resolved + 'alfven_wasm.js' + suffix);
    const embeddedBinary = globalThis.ALFVEN_WASM_BINARY || undefined;
    modulePromise = AlfvenModule(moduleOptions(resolved, suffix, embeddedBinary)).catch((err) => {
      if (!embeddedBinary || !isImportLinkError(err)) throw err;
      send({ type: 'log', level: 'stderr', text: 'Embedded wasm link failed, retrying with network wasm...' });
      return AlfvenModule(moduleOptions(resolved, suffix, undefined));
    });
  }
  return modulePromise;
}

function ensureDir(mod, path) {
  if (!mod.FS.analyzePath(path).exists) mod.FS.mkdir(path);
}

function clearSnapshots(mod, dir, count) {
  for (let i = 0; i < count; i++) {
    const name = dir + '/snapshot_' + String(i).padStart(3, '0') + '.dat';
    try { mod.FS.unlink(name); } catch {}
  }
}

function loadSnapshots(mod, dir, count) {
  const frames = [];
  for (let i = 0; i < count; i++) {
    const name = dir + '/snapshot_' + String(i).padStart(3, '0') + '.dat';
    try {
      const snapshotText = mod.FS.readFile(name, { encoding: 'utf8' });
      frames.push(snapshotText);
    } catch (err) {
      if (i === 0) {
        send({ type: 'log', level: 'stderr', text: 'Snapshot read failed in ' + dir + ': ' + (err.message || err) });
      }
      break;
    }
  }
  return frames;
}

function classifyTermination(exitCode, logs) {
  const hay = (logs || []).map((x) => x && x.text ? x.text : '').join('\n');
  if (hay.includes('Blowup guard triggered')) {
    return { kind: 'blowup_guard', message: 'Blowup guard triggered. Simulation stopped early.' };
  }
  if (hay.includes('Non-finite state detected')) {
    return { kind: 'non_finite', message: 'Non-finite state detected. Simulation aborted.' };
  }
  if (exitCode === 3) {
    return { kind: 'blowup_guard', message: 'Blowup guard triggered. Simulation stopped early.' };
  }
  if (exitCode === 2) {
    return { kind: 'non_finite', message: 'Non-finite state detected. Simulation aborted.' };
  }
  if (exitCode === 0 || exitCode == null) return { kind: 'ok', message: '' };
  return { kind: 'exit_error', message: 'Simulation exited with non-zero status.' };
}

function runBoth(mod, args, dir, snapshotCount) {
  const planeArgs = args.slice();
  planeArgs.push('--snapshot_dir', dir, '--snapshot_plane', 'both');
  clearSnapshots(mod, dir, snapshotCount);
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  let exitCode = 0;
  try {
    const rc = mod.callMain(planeArgs);
    if (typeof rc === 'number' && Number.isFinite(rc)) exitCode = rc;
  } catch (err) {
    if (err && typeof err.status === 'number') {
      exitCode = err.status;
    } else {
      throw err;
    }
  }
  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const frames = loadSnapshots(mod, dir, snapshotCount);
  return { frames, exitCode, runtimeSec: Math.max(0, (t1 - t0) / 1000.0) };
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  if (msg.type === 'init') {
    if (msg.baseUrl) baseUrl = msg.baseUrl;
    return;
  }
  if (msg.type !== 'run') return;
  if (!baseUrl && msg.baseUrl) baseUrl = msg.baseUrl;
  if (busy) {
    send({ type: 'error', runId: msg.runId, message: 'Worker busy' });
    return;
  }
  busy = true;
  try {
    activeRun = { runId: msg.runId, logs: [] };
    const mod = await initModule();
    mod.onSnapshot = (text) => {
      send({ type: 'snapshot', runId: msg.runId, text });
    };
    const args = msg.args || [];
    const snapshotCount = msg.snapshotCount || 1;
    ensureDir(mod, '/snapshots');
    send({ type: 'log', level: 'stdout', text: 'Running both planes...' });
    const result = runBoth(mod, args, '/snapshots', snapshotCount);
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
