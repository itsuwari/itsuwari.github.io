(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const runBtn = document.getElementById('runBtn');
  const presetBtn = document.getElementById('presetBtn');
  const fig3PresetBtn = document.getElementById('fig3PresetBtn');
  const backendEl = document.getElementById('backend');
  const presetEl = document.getElementById('orszagPreset');
  const methodEl = document.getElementById('method');
  const profileEl = document.getElementById('profile');
  const nxEl = document.getElementById('nx');
  const nyEl = document.getElementById('ny');
  const nvxEl = document.getElementById('nvx');
  const nvyEl = document.getElementById('nvy');
  const nvzEl = document.getElementById('nvz');
  const rankFEl = document.getElementById('rankF');
  const rankEMEl = document.getElementById('rankEM');
  const dtEl = document.getElementById('dt');
  const tfinalEl = document.getElementById('tfinal');
  const reportPointsEl = document.getElementById('reportPoints');
  const snapshotCountEl = document.getElementById('snapshotCount');
  const lboxEl = document.getElementById('lbox');
  const b0OverBgEl = document.getElementById('b0OverBg');
  const u0OverVaEl = document.getElementById('u0OverVa');
  const betaPEl = document.getElementById('betaP');
  const mpMeEl = document.getElementById('mpMe');
  const tpTeEl = document.getElementById('tpTe');
  const cOverVaEl = document.getElementById('cOverVa');
  const vboundSigmaEl = document.getElementById('vboundSigma');

  const statusEl = document.getElementById('status');
  const backendHintEl = document.getElementById('backendHint');
  const runtimeEl = document.getElementById('runtime');
  const cppTimeEl = document.getElementById('cppTime');
  const heapEl = document.getElementById('heap');
  const frameCountEl = document.getElementById('frameCount');
  const frameIndexEl = document.getElementById('frameIndex');
  const frameMaxEl = document.getElementById('frameMax');
  const frameTimeEl = document.getElementById('frameTime');
  const rangeLabelEl = document.getElementById('rangeLabel');
  const frameSlider = document.getElementById('frameSlider');
  const logEl = document.getElementById('log');

  const logLines = [];
  let frames = [];
  let currentRunId = 0;
  let currentFrameIndex = 0;
  let running = false;

  let worker;

  const FIG3_PRESETS = {
    fig3a: { t: 21 },
    fig3b: { t: 21 },
    fig3c: { t: 9 },
  };

  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');

  function setStatus(text, tone = 'idle') {
    statusEl.textContent = text;
    const styles = {
      idle: { b: '#33445f', bg: '#18233a' },
      run: { b: '#4b6785', bg: '#21324d' },
      warn: { b: '#b38c3b', bg: '#35290f' },
      error: { b: '#d06f6f', bg: '#341a1a' },
    };
    const s = styles[tone] || styles.idle;
    statusEl.style.borderColor = s.b;
    statusEl.style.background = s.bg;
  }

  function setHint(text) {
    backendHintEl.textContent = text;
  }

  function appendLog(text, isErr = false) {
    const line = `${new Date().toLocaleTimeString()} ${isErr ? '[err]' : '[out]'} ${text}`;
    logLines.push(line);
    if (logLines.length > 300) logLines.shift();
    logEl.textContent = logLines.join('\n');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function asNumber(el, fallback) {
    const v = Number(el.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function buildArgs() {
    const backend = backendEl.value;
    const preset = presetEl.value || 'custom';
    const finalTime = preset === 'custom' ? asNumber(tfinalEl, 12) : (FIG3_PRESETS[preset] ? FIG3_PRESETS[preset].t : asNumber(tfinalEl, 12));
    const args = [
      '--solver_family', backend === 'dlr' ? 'dlr' : 'qtt',
      '--problem', 'orszag',
      '--orszag_preset', preset,
      '--orszag_profile', profileEl.value,
      '--method', methodEl.value,
      '--deltat', String(asNumber(dtEl, 1e-3)),
      '--final_time', String(finalTime),
      '--nx', String(asNumber(nxEl, 64)),
      '--ny', String(asNumber(nyEl, 64)),
      '--nvx', String(asNumber(nvxEl, 16)),
      '--nvy', String(asNumber(nvyEl, 16)),
      '--nvz', String(asNumber(nvzEl, 16)),
      '--rank_f', String(asNumber(rankFEl, 24)),
      '--rank_em', String(asNumber(rankEMEl, 24)),
      '--report_points', String(Math.max(1, Math.floor(asNumber(reportPointsEl, 200)))),
      '--orszag_lbox_dp', String(asNumber(lboxEl, Math.PI)),
      '--orszag_mp_me', String(asNumber(mpMeEl, 25)),
      '--orszag_beta_p', String(asNumber(betaPEl, 0.03)),
      '--orszag_tp_te', String(asNumber(tpTeEl, 1.0)),
      '--orszag_c_over_va', String(asNumber(cOverVaEl, 50)),
      '--orszag_bg', '1.0',
      '--orszag_b0_over_bg', String(asNumber(b0OverBgEl, 1.8)),
      '--orszag_u0_over_va', String(asNumber(u0OverVaEl, 1.4)),
      '--orszag_vbound_sigma', String(asNumber(vboundSigmaEl, 7.0)),
    ];

    if (backend.startsWith('qtt_')) {
      args.push('--qtt_backend_mode');
      args.push(backend === 'qtt_family3' ? 'family3' : 'family4_paper');
    }

    return args;
  }

  function setDefaultVibrantPreset() {
    presetEl.value = 'custom';
    backendEl.value = 'qtt_family4_paper';
    methodEl.value = 'strang';
    profileEl.value = 'debug';
    nxEl.value = 64;
    nyEl.value = 64;
    nvxEl.value = 16;
    nvyEl.value = 16;
    nvzEl.value = 16;
    rankFEl.value = 24;
    rankEMEl.value = 24;
    dtEl.value = 1e-3;
    tfinalEl.value = 12;
    reportPointsEl.value = 200;
    snapshotCountEl.value = 1;
    lboxEl.value = Math.PI;
    b0OverBgEl.value = 1.8;
    u0OverVaEl.value = 1.4;
    betaPEl.value = 0.03;
    mpMeEl.value = 25;
    tpTeEl.value = 1;
    cOverVaEl.value = 50;
    vboundSigmaEl.value = 7;
    applyPresetLock();
    setHint('Vibrant preset loaded.');
  }

  function setDefaultFig3Preset() {
    presetEl.value = 'fig3b';
    backendEl.value = 'qtt_family4_paper';
    methodEl.value = 'strang';
    profileEl.value = 'debug';
    nxEl.value = 64;
    nyEl.value = 64;
    nvxEl.value = 16;
    nvyEl.value = 16;
    nvzEl.value = 16;
    rankFEl.value = 24;
    rankEMEl.value = 24;
    dtEl.value = 1e-3;
    reportPointsEl.value = 200;
    snapshotCountEl.value = 1;
    lboxEl.value = Math.PI;
    b0OverBgEl.value = 1.8;
    u0OverVaEl.value = 1.4;
    betaPEl.value = 0.03;
    mpMeEl.value = 25;
    tpTeEl.value = 1;
    cOverVaEl.value = 50;
    vboundSigmaEl.value = 7;
    applyPresetLock();
    setHint('Figure-3 preset (fig3b) loaded.');
  }

  function applyPresetLock() {
    const preset = presetEl.value || 'custom';
    if (FIG3_PRESETS[preset]) {
      tfinalEl.value = String(FIG3_PRESETS[preset].t);
      tfinalEl.disabled = true;
      setHint(`Preset ${preset} selected`);
    } else {
      tfinalEl.disabled = false;
      setHint('Custom preset selected');
    }
  }

  function colorMap(t) {
    t = Math.max(0, Math.min(1, t));
    let r; let g; let b;
    if (t < 0.35) {
      const u = t / 0.35;
      r = 10 + 20 * u;
      g = 20 + 140 * u;
      b = 40 + 180 * u;
    } else if (t < 0.75) {
      const u = (t - 0.35) / 0.40;
      r = 30 + 200 * u;
      g = 160 + 80 * u;
      b = 220 - 170 * u;
    } else {
      const u = (t - 0.75) / 0.25;
      r = 230 + 25 * u;
      g = 240 - 200 * u;
      b = 50 - 40 * u;
    }
    return [r | 0, g | 0, b | 0];
  }

  function createFrame(text) {
    const lines = text.split(/\r?\n/);
    const frame = {
      axisX: [],
      axisY: [],
      data: [],
      meta: {},
    };

    let inData = false;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#')) {
        if (line.startsWith('# field=')) {
          const tMatch = /t=([0-9eE+\-.]+)/.exec(line);
          if (tMatch) frame.meta.t = Number(tMatch[1]);
        }
        if (line.startsWith('# axis_x:')) {
          const nums = line.replace('# axis_x:', '').trim().split(/\s+/).filter(Boolean).map(Number);
          if (nums.length) frame.axisX.push(...nums);
        } else if (line.startsWith('# axis_y:')) {
          const nums = line.replace('# axis_y:', '').trim().split(/\s+/).filter(Boolean).map(Number);
          if (nums.length) frame.axisY.push(...nums);
        }
        if (/^#\s*data\b/.test(line)) inData = true;
        continue;
      }
      if (!inData) continue;
      const row = line.split(/\s+/).filter(Boolean).map(Number);
      if (row.length) frame.data.push(row);
    }

    if (!frame.axisX.length || !frame.axisY.length || !frame.data.length) {
      throw new Error('Malformed snapshot file (missing axis/data).');
    }

    return frame;
  }

  function renderFrame(index) {
    if (!frames[index]) return;
    const frame = frames[index];
    const yN = frame.axisY.length;
    const xN = frame.axisX.length;

    off.width = xN;
    off.height = yN;

    let min = Infinity;
    let max = -Infinity;
    for (const row of frame.data) {
      for (const v of row) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }

    if (!(Number.isFinite(min) && Number.isFinite(max) && max > min)) {
      min = -1;
      max = 1;
    }

    const img = offCtx.createImageData(xN, yN);
    const a = 1 / (max - min);
    let p = 0;
    for (let y = 0; y < yN; y++) {
      const row = frame.data[y] || [];
      for (let x = 0; x < xN; x++) {
        const v = Number.isFinite(row[x]) ? row[x] : min;
        const t = (v - min) * a;
        const [r, g, b] = colorMap(t);
        img.data[p++] = r;
        img.data[p++] = g;
        img.data[p++] = b;
        img.data[p++] = 255;
      }
    }

    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

    frameIndexEl.textContent = index;
    frameMaxEl.textContent = Math.max(0, frames.length - 1);
    frameCountEl.textContent = frames.length;
    frameTimeEl.textContent = Number.isFinite(frame.meta.t) ? frame.meta.t.toFixed(4) : '--';
    rangeLabelEl.textContent = `[${min.toExponential(2)}, ${max.toExponential(2)}]`;

    currentFrameIndex = index;
    frameSlider.value = String(index);
  }

  function onFrameSlider() {
    const max = Math.max(0, frames.length - 1);
    const next = Math.max(0, Math.min(max, Number.parseInt(frameSlider.value || '0', 10)));
    renderFrame(next);
  }

  function ensureWorker() {
    if (worker) return;
    worker = new Worker(new URL('worker.js', window.location.href));
    const baseUrl = new URL('../alfven/', window.location.href).toString();
    worker.postMessage({ type: 'init', baseUrl });

    worker.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.runId !== currentRunId) return;

      if (msg.type === 'loading') {
        const pct = Number(msg.pct);
        if (Number.isFinite(pct)) {
          setHint(`Loading WASM ${Math.round(pct * 100)}%`);
        }
        return;
      }

      if (msg.type === 'log') {
        appendLog(msg.text, msg.level === 'stderr');
        return;
      }

      if (msg.type === 'error') {
        running = false;
        setStatus('Worker error', 'error');
        runBtn.disabled = false;
        appendLog(`Worker error: ${msg.message}`, true);
        return;
      }

      if (msg.type === 'result') {
        running = false;
        runBtn.disabled = false;
        cppTimeEl.textContent = msg.runtimeSec ? `${msg.runtimeSec.toFixed(3)} s` : '--';
        heapEl.textContent = msg.heapBytes ? `${(msg.heapBytes / (1024 * 1024)).toFixed(1)} MB` : '--';

        if (msg.runtimeSec) {
          runtimeEl.textContent = `${msg.runtimeSec.toFixed(3)} s`;
        }

        if (msg.exitCode === 0) {
          setStatus('Done', 'idle');
        } else if (msg.terminationKind === 'blowup_guard') {
          setStatus(msg.terminationMessage || 'Stopped', 'warn');
        } else if (msg.terminationKind === 'non_finite') {
          setStatus(msg.terminationMessage || 'Stopped', 'error');
        } else {
          setStatus(`Stopped (${msg.exitCode})`, 'error');
        }

        frames = [];
        for (const txt of msg.frames || []) {
          try {
            frames.push(createFrame(txt));
          } catch (err) {
            appendLog(`Frame parse error: ${err.message || err}`,
              true);
          }
        }

        frameSlider.max = String(Math.max(0, frames.length - 1));
        if (frames.length === 0) {
          setStatus('No frames returned', 'warn');
          setHint('No snapshot found for selected settings');
          frameSlider.value = '0';
          frameCountEl.textContent = '0';
          frameIndexEl.textContent = '0';
          frameMaxEl.textContent = '0';
          frameTimeEl.textContent = '--';
          rangeLabelEl.textContent = '--';
          return;
        }

        frameSlider.value = '0';
        renderFrame(0);
        return;
      }
    };
  }

  function onRun() {
    if (running) return;
    ensureWorker();
    running = true;
    runBtn.disabled = true;
    currentFrameIndex = 0;
    frames = [];
    currentRunId += 1;
    setStatus('Running', 'run');
    appendLog(`Run #${currentRunId} start`);
    const args = buildArgs();
    setHint(`Backend: ${backendEl.value}`);
    const start = performance.now();
    runtimeEl.textContent = '--';
    cppTimeEl.textContent = '--';
    heapEl.textContent = '--';
    frameSlider.value = '0';
    frameSlider.max = '0';

    worker.postMessage({
      type: 'run',
      runId: currentRunId,
      args,
      snapshotCount: Math.max(1, Math.floor(asNumber(snapshotCountEl, 1))),
    });

    const updateRuntime = () => {
      if (!running) return;
      runtimeEl.textContent = `${((performance.now() - start) / 1000).toFixed(1)} s`;
      requestAnimationFrame(updateRuntime);
    };
    updateRuntime();
  }

  backendEl.addEventListener('change', () => {
    const v = backendEl.value;
    if (v === 'dlr') {
      setHint('DLR mode selected');
    } else if (v === 'qtt_family3') {
      setHint('QTT family3 selected');
    } else {
      setHint('QTT family4_paper selected');
    }
  });
  presetEl.addEventListener('change', applyPresetLock);

  frameSlider.addEventListener('input', onFrameSlider);
  runBtn.addEventListener('click', onRun);
  presetBtn.addEventListener('click', setDefaultVibrantPreset);
  fig3PresetBtn.addEventListener('click', setDefaultFig3Preset);

  setDefaultVibrantPreset();
  runtimeEl.textContent = '--';
  cppTimeEl.textContent = '--';
  heapEl.textContent = '--';
  frameSlider.max = '0';
  frameSlider.value = '0';
})();
