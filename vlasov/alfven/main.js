(() => {
  const ASSET_VERSION = '2026-02-12i';
  const statusEl = document.getElementById('status');
  const runBtn = document.getElementById('runBtn');
  const logEl = document.getElementById('log');
  const jsRuntimeEl = document.getElementById('jsRuntime');
  const cppRuntimeEl = document.getElementById('cppRuntime');
  const jsHeapEl = document.getElementById('jsHeap');
  const frameCountZvEl = document.getElementById('frameCountZv');
  const frameCountXvEl = document.getElementById('frameCountXv');
  const legendEl = document.getElementById('legend');
  const heatmap = document.getElementById('heatmap');
  const frameSlider = document.getElementById('frameSlider');
  const frameLabel = document.getElementById('frameLabel');
  const legendXvEl = document.getElementById('legendXv');
  const heatmapXv = document.getElementById('heatmapXv');
  const scaleZv = document.getElementById('scaleZv');
  const scaleXv = document.getElementById('scaleXv');
  const zoomZv = document.getElementById('zoomZv');
  const zoomXv = document.getElementById('zoomXv');
  const plotZv = document.getElementById('plotZv');
  const plotXv = document.getElementById('plotXv');
  const energyPlot = document.getElementById('energyPlot');
  const errorPlot = document.getElementById('errorPlot');
  const legendEnergy = document.getElementById('legendEnergy');
  const legendError = document.getElementById('legendError');

  const inputNx = document.getElementById('nx');
  const inputNy = document.getElementById('ny');
  const inputNz = document.getElementById('nz');
  const inputNv = document.getElementById('nv');
  const inputRank = document.getElementById('rank');
  const inputKx = document.getElementById('kx');
  const inputKy = document.getElementById('ky');
  const inputKz = document.getElementById('kz');
  const inputBetaMe = document.getElementById('betaMe');
  const inputRhoI = document.getElementById('rhoI');
  const inputMethod = document.getElementById('method');
  const inputDiscr = document.getElementById('discretization');
  const inputAlpha = document.getElementById('alpha');
  const inputDt = document.getElementById('dt');
  const inputSteps = document.getElementById('steps');
  const inputRefreshSteps = document.getElementById('refreshSteps');

  const timeHint = document.getElementById('timeHint');
  const chipDt = document.getElementById('chipDt');
  const chipTfinal = document.getElementById('chipTfinal');
  const chipRefresh = document.getElementById('chipRefresh');
  const chipMethod = document.getElementById('chipMethod');
  const chipDiscr = document.getElementById('chipDiscr');
  const chipK = document.getElementById('chipK');
  const chipBeta = document.getElementById('chipBeta');
  const chipRho = document.getElementById('chipRho');

  let logLines = [];
  let framesZv = [];
  let framesXv = [];
  let statsZv = null;
  let statsXv = null;
  let worker = null;
  let currentRunId = 0;
  let runStart = 0;
  let diagnostics = null;

  function setStatus(text, tone = 'idle') {
    statusEl.textContent = text;
    const styles = {
      idle: { border: '#cfd9e8', bg: '#f7f9fd' },
      run: { border: '#c7d4e8', bg: '#eef3fb' },
      warn: { border: '#dcc384', bg: '#fbf6e8' },
      error: { border: '#e6b0b0', bg: '#fdf0f0' },
    };
    const chosen = styles[tone] || styles.idle;
    statusEl.style.borderColor = chosen.border;
    statusEl.style.background = chosen.bg;
  }

  function appendLog(text, isErr = false) {
    if (text == null) return;
    logLines.push(text);
    logEl.textContent += (isErr ? '[err] ' : '') + text + '\n';
    logEl.scrollTop = logEl.scrollHeight;
    if (!isErr && text.includes('Wall time:')) {
      const match = /Wall time:\s*([0-9eE+\-.]+)/.exec(text);
      if (match) {
        const val = Number(match[1]);
        if (Number.isFinite(val)) {
          cppRuntimeEl.textContent = `${val.toFixed(3)} s`;
        }
      }
    }
    if (!isErr && text.startsWith('t=')) {
      const parsed = parseDiagnosticsLine(text);
      if (parsed) {
        pushDiagnostics(parsed);
        renderDiagnostics();
      }
    }
  }

  function clearLog() {
    logLines = [];
    logEl.textContent = '';
  }

  function getWorker() {
    if (worker) return worker;
    const workerUrl = new URL('worker.js', window.location.href);
    workerUrl.searchParams.set('v', ASSET_VERSION);
    worker = new Worker(workerUrl);
    worker.onmessage = handleWorkerMessage;
    return worker;
  }

  function handleWorkerMessage(event) {
    const msg = event.data || {};
    if (msg.type === 'log') {
      appendLog(msg.text, msg.level === 'stderr');
      return;
    }
    if (msg.type === 'loading') {
      const pct = Math.round((msg.pct || 0) * 100);
      setStatus(`Loading... ${pct}%`, 'run');
      return;
    }
    if (msg.type === 'snapshot') {
      if (msg.runId !== currentRunId) return;
      try {
        const planes = parseSnapshot(msg.text);
        if (planes.zv) framesZv.push(planes.zv);
        if (planes.xv) framesXv.push(planes.xv);
        statsZv = computeStats(framesZv);
        statsXv = computeStats(framesXv);
        updateSharedFrameUI();
      } catch (err) {
        appendLog(`Snapshot parse failed: ${err.message || err}`, true);
      }
      return;
    }
    if (msg.type === 'error') {
      appendLog(`WASM worker error: ${msg.message}`, true);
      runBtn.disabled = false;
      setStatus('Worker error', 'error');
      return;
    }
    if (msg.type === 'result') {
      if (msg.runId !== currentRunId) return;
      const jsRuntime = (performance.now() - runStart) / 1000.0;
      jsRuntimeEl.textContent = `${jsRuntime.toFixed(3)} s`;
      if (performance.memory && performance.memory.usedJSHeapSize) {
        const jsMB = performance.memory.usedJSHeapSize / (1024 * 1024);
        jsHeapEl.textContent = `${jsMB.toFixed(1)} MB`;
      } else {
        jsHeapEl.textContent = 'n/a';
      }
      framesZv = [];
      framesXv = [];
      for (const text of msg.frames || []) {
        const planes = parseSnapshot(text);
        if (planes.zv) framesZv.push(planes.zv);
        if (planes.xv) framesXv.push(planes.xv);
      }
      statsZv = computeStats(framesZv);
      statsXv = computeStats(framesXv);
      appendLog(`Loaded ${framesZv.length} zv snapshot(s), ${framesXv.length} xv snapshot(s).`);
      updateSharedFrameUI();
      const cppRuntime = parseWallTime();
      if (cppRuntime != null) {
        cppRuntimeEl.textContent = `${cppRuntime.toFixed(3)} s`;
      } else if (Number.isFinite(msg.runtimeSec)) {
        cppRuntimeEl.textContent = `${msg.runtimeSec.toFixed(3)} s`;
      }

      const exitCode = Number.isFinite(msg.exitCode) ? msg.exitCode : 0;
      if (exitCode !== 0) {
        const reason = msg.terminationMessage || `Simulation exited with status ${exitCode}.`;
        appendLog(`${reason} (exit code ${exitCode})`, true);
      }
      runBtn.disabled = false;
      if (exitCode === 0) {
        setStatus('Idle');
      } else if (msg.terminationKind === 'blowup_guard') {
        setStatus('Stopped: blowup detected', 'warn');
      } else if (msg.terminationKind === 'non_finite') {
        setStatus('Stopped: non-finite state', 'error');
      } else {
        setStatus(`Stopped (exit ${exitCode})`, 'error');
      }
    }
  }

  function parseSnapshot(text) {
    const axis1 = [];
    const axis2 = [];
    const data = [];
    let t = null;
    let currentPlane = null;
    const planes = {};

    const commit = () => {
      if (!currentPlane) return;
      if (!axis1.length || !axis2.length || !data.length) return;
      planes[currentPlane] = {
        axis1: axis1.slice(),
        axis2: axis2.slice(),
        data: data.map((row) => row.slice()),
        t,
      };
      axis1.length = 0;
      axis2.length = 0;
      data.length = 0;
    };

    const lines = text.trim().split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('# t=')) {
        const match = /#\s*t=([0-9eE+\-\.]+)/.exec(line);
        if (match) t = Number(match[1]);
        const planeMatch = /plane=([a-z]+)/.exec(line);
        if (planeMatch && planeMatch[1] !== 'both') {
          currentPlane = planeMatch[1];
        }
      }
      if (line.startsWith('# plane=')) {
        commit();
        const match = /#\s*plane=([a-z]+)/.exec(line);
        if (match) currentPlane = match[1];
        continue;
      }
      if (line.startsWith('# axis1:')) {
        const parts = line.replace('# axis1:', '').trim().split(/\s+/).filter(Boolean);
        axis1.push(...parts.map(Number));
      } else if (line.startsWith('# axis2:')) {
        const parts = line.replace('# axis2:', '').trim().split(/\s+/).filter(Boolean);
        axis2.push(...parts.map(Number));
      } else if (line.startsWith('#')) {
        continue;
      } else {
        const row = line.trim().split(/\s+/).filter(Boolean).map(Number);
        if (row.length) data.push(row);
      }
    }
    commit();
    if (!Object.keys(planes).length) {
      if (!axis1.length || !axis2.length || !data.length) {
        throw new Error('Snapshot parse failed. Missing axis or data.');
      }
      const fallbackPlane = currentPlane || 'zv';
      planes[fallbackPlane] = { axis1, axis2, data, t };
    }
    return planes;
  }

  function colorMap(t) {
    const stops = [
      { t: 0.0, c: [68, 1, 84] },
      { t: 0.25, c: [59, 82, 139] },
      { t: 0.5, c: [33, 145, 140] },
      { t: 0.75, c: [94, 201, 98] },
      { t: 1.0, c: [253, 231, 37] },
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (t >= a.t && t <= b.t) {
        const u = (t - a.t) / (b.t - a.t);
        return [
          Math.round(a.c[0] + u * (b.c[0] - a.c[0])),
          Math.round(a.c[1] + u * (b.c[1] - a.c[1])),
          Math.round(a.c[2] + u * (b.c[2] - a.c[2])),
        ];
      }
    }
    return stops[stops.length - 1].c;
  }

  function computeStats(frames) {
    if (!frames.length) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const frame of frames) {
      for (const row of frame.data) {
        for (const val of row) {
          if (!Number.isFinite(val)) continue;
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max, base: frames[0].data };
  }

  function prepareCanvas(canvas) {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function renderHeatmap(snapshot, canvas, legend, scaleMode, stats, zoomMode) {
    const { data } = snapshot;
    const nz = data.length;
    const nv = data[0].length;
    let min = Infinity;
    let max = -Infinity;
    if (scaleMode === 'global' && stats) {
      min = stats.min;
      max = stats.max;
    } else if (scaleMode === 'delta' && stats) {
      const base = stats.base;
      for (let i = 0; i < nz; i++) {
        for (let j = 0; j < nv; j++) {
          const val = data[i][j] - base[i][j];
          if (!Number.isFinite(val)) continue;
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
      if (Number.isFinite(min) && Number.isFinite(max)) {
        const maxAbs = Math.max(Math.abs(min), Math.abs(max));
        min = -maxAbs;
        max = maxAbs;
      }
    } else {
      for (const row of data) {
        for (const val of row) {
          if (!Number.isFinite(val)) continue;
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      renderEmpty(canvas, 'No finite values in snapshot');
      return;
    }
    legend.textContent = `min ${min.toExponential(3)} / max ${max.toExponential(3)}` + (scaleMode === 'delta' ? ' (delta)' : '');

    let rowStart = 0;
    let rowEnd = nz - 1;
    let colStart = 0;
    let colEnd = nv - 1;

    if (zoomMode === 'auto') {
      const maxAbs = Math.max(Math.abs(min), Math.abs(max));
      const threshold = maxAbs * 0.02;
      if (threshold > 0) {
        let r0 = nz;
        let r1 = -1;
        let c0 = nv;
        let c1 = -1;
        for (let iz = 0; iz < nz; iz++) {
          for (let iv = 0; iv < nv; iv++) {
            const raw = data[iz][iv];
            const v = (scaleMode === 'delta' && stats) ? raw - stats.base[iz][iv] : raw;
            if (!Number.isFinite(v)) continue;
            if (Math.abs(v) >= threshold) {
              if (iz < r0) r0 = iz;
              if (iz > r1) r1 = iz;
              if (iv < c0) c0 = iv;
              if (iv > c1) c1 = iv;
            }
          }
        }
        if (r1 >= 0) {
          const pad = 1;
          rowStart = Math.max(0, r0 - pad);
          rowEnd = Math.min(nz - 1, r1 + pad);
          colStart = Math.max(0, c0 - pad);
          colEnd = Math.min(nv - 1, c1 + pad);
        }
      }
    }

    const outH = rowEnd - rowStart + 1;
    const outW = colEnd - colStart + 1;

    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const offCtx = off.getContext('2d');
    const img = offCtx.createImageData(outW, outH);
    const range = max - min || 1.0;

    for (let iz = rowStart; iz <= rowEnd; iz++) {
      for (let iv = colStart; iv <= colEnd; iv++) {
        const raw = data[iz][iv];
        const v = (scaleMode === 'delta' && stats) ? raw - stats.base[iz][iv] : raw;
        const t = Math.min(1, Math.max(0, (v - min) / range));
        const [r, g, b] = colorMap(t);
        const outI = iz - rowStart;
        const outJ = iv - colStart;
        const idx = (outI * outW + outJ) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }

    offCtx.putImageData(img, 0, 0);
    const { ctx, width, height } = prepareCanvas(canvas);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(off, 0, 0, width, height);
  }

  function renderEmpty(canvas, message) {
    const { ctx, width, height } = prepareCanvas(canvas);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#6b7a90';
    ctx.font = '14px IBM Plex Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
  }

  function parseDiagnosticsLine(line) {
    const map = {};
    const re = /([a-zA-Z_\/\(\)]+)=([-+0-9.eE]+)/g;
    let m;
    while ((m = re.exec(line))) {
      map[m[1]] = Number(m[2]);
    }
    if (!Number.isFinite(map.t)) return null;
    return {
      t: map.t,
      mass: map.mass,
      mom: map.mom,
      kin: map.kin,
      ee: map.ee,
      me: map.me,
    };
  }

  function resetDiagnostics() {
    diagnostics = {
      t: [],
      ee: [],
      me: [],
      kin: [],
      mass: [],
      mom: [],
      totalE: [],
      errMass: [],
      errMom: [],
      errE: [],
      mass0: null,
      mom0: null,
      e0: null,
    };
    renderEmpty(energyPlot, 'No data');
    renderEmpty(errorPlot, 'No data');
  }

  function pushDiagnostics(d) {
    if (!diagnostics) resetDiagnostics();
    const ee = Number.isFinite(d.ee) ? d.ee : 0.0;
    const me = Number.isFinite(d.me) ? d.me : 0.0;
    const kin = Number.isFinite(d.kin) ? d.kin : 0.0;
    const mass = Number.isFinite(d.mass) ? d.mass : 0.0;
    const mom = Number.isFinite(d.mom) ? d.mom : 0.0;
    const totalE = ee + me + kin;
    if (diagnostics.mass0 == null) diagnostics.mass0 = mass;
    if (diagnostics.mom0 == null) diagnostics.mom0 = mom;
    if (diagnostics.e0 == null) diagnostics.e0 = totalE;

    const denomMass = Math.abs(diagnostics.mass0) || 1.0;
    const denomMom = Math.abs(diagnostics.mom0) || 1.0;
    const denomE = Math.abs(diagnostics.e0) || 1.0;

    diagnostics.t.push(d.t);
    diagnostics.ee.push(ee);
    diagnostics.me.push(me);
    diagnostics.kin.push(kin);
    diagnostics.mass.push(mass);
    diagnostics.mom.push(mom);
    diagnostics.totalE.push(totalE);
    diagnostics.errMass.push((mass - diagnostics.mass0) / denomMass);
    diagnostics.errMom.push((mom - diagnostics.mom0) / denomMom);
    diagnostics.errE.push((totalE - diagnostics.e0) / denomE);
  }

  function drawLineChart(canvas, series, labels, opts = {}) {
    const { ctx, width: canvasWidth, height: canvasHeight } = prepareCanvas(canvas);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (!series || !series.t.length) {
      renderEmpty(canvas, 'No data');
      return;
    }

    const padLeft = 52;
    const padRight = 16;
    const padTop = 16;
    const padBottom = 36;
    const w = canvasWidth - padLeft - padRight;
    const h = canvasHeight - padTop - padBottom;
    const tMin = series.t[0];
    const tMax = series.t[series.t.length - 1];
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const key of labels.map((l) => l.key)) {
      for (const v of series[key]) {
        if (!Number.isFinite(v)) continue;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yPad = (yMax - yMin) * 0.08;
    yMin -= yPad;
    yMax += yPad;

    const toX = (t) => padLeft + ((t - tMin) / (tMax - tMin || 1)) * w;
    const toY = (v) => padTop + h - ((v - yMin) / (yMax - yMin || 1)) * h;

    ctx.strokeStyle = 'rgba(23, 33, 52, 0.1)';
    ctx.lineWidth = 1.0;
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (h * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + w, y);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = padLeft + (w * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + h);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(23, 33, 52, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + h);
    ctx.lineTo(padLeft + w, padTop + h);
    ctx.stroke();

    if (opts.zeroLine && yMin < 0 && yMax > 0) {
      const y0 = toY(0.0);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(23, 33, 52, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y0);
      ctx.lineTo(padLeft + w, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = 'rgba(23, 33, 52, 0.72)';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const yVal = yMin + ((yMax - yMin) * (4 - i)) / 4;
      const y = padTop + (h * i) / 4;
      ctx.fillText(yVal.toExponential(2), padLeft - 6, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const xVal = tMin + ((tMax - tMin) * i) / 4;
      const x = padLeft + (w * i) / 4;
      ctx.fillText(xVal.toExponential(2), x, padTop + h + 6);
    }
    ctx.save();
    ctx.translate(12, padTop + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.yLabel || 'value', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.xLabel || 't', padLeft + w / 2, canvasHeight - 12);

    // legend
    ctx.font = '12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let lx = padLeft + 8;
    const ly = padTop + 10;
    for (const label of labels) {
      ctx.fillStyle = label.color;
      ctx.fillRect(lx, ly - 4, 10, 10);
      ctx.fillStyle = 'rgba(23, 33, 52, 0.82)';
      ctx.fillText(label.name || label.key, lx + 14, ly + 1);
      lx += 90;
    }

    for (const label of labels) {
      const values = series[label.key];
      ctx.strokeStyle = label.color;
      ctx.lineWidth = 2.1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < series.t.length; i++) {
        const x = toX(series.t[i]);
        const y = toY(values[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // markers
      ctx.fillStyle = label.color;
      const markerStride = opts.markerStride || 5;
      const markerRadius = series.t.length > 240 ? 1.6 : 2.2;
      for (let i = 0; i < series.t.length; i++) {
        if (i % markerStride !== 0) continue;
        const x = toX(series.t[i]);
        const y = toY(values[i]);
        ctx.beginPath();
        ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function renderDiagnostics() {
    if (!diagnostics || !diagnostics.t.length) return;
    drawLineChart(energyPlot, diagnostics, [
      { key: 'ee', color: '#1f77b4', name: 'E_e' },
      { key: 'me', color: '#ff7f0e', name: 'E_m' },
      { key: 'kin', color: '#2ca02c', name: 'E_k' },
    ], { yLabel: 'energy', xLabel: 't', markerStride: 4 });
    drawLineChart(errorPlot, diagnostics, [
      { key: 'errMass', color: '#1f77b4', name: 'mass' },
      { key: 'errMom', color: '#ff7f0e', name: 'momentum' },
      { key: 'errE', color: '#2ca02c', name: 'energy' },
    ], { yLabel: 'rel error', xLabel: 't', markerStride: 4, zeroLine: true });
  }

  function parseWallTime() {
    const line = [...logLines].reverse().find((l) => l.includes('Wall time:'));
    if (!line) return null;
    const match = /Wall time:\s*([0-9eE+\-.]+)/.exec(line);
    if (!match) return null;
    return Number(match[1]);
  }

  function computeSnapshotCount(steps, refreshSteps) {
    if (!Number.isFinite(refreshSteps) || refreshSteps <= 0) return 1;
    const count = Math.floor(steps / refreshSteps) + 1;
    return Math.max(1, count);
  }

  function updateTimeHints() {
    const dt = Number(inputDt.value);
    const steps = Number(inputSteps.value);
    const refreshSteps = Number(inputRefreshSteps.value);
    const method = inputMethod.value;
    const phi = 'ensign';
    const discr = inputDiscr.value;
    const kx = Number(inputKx.value);
    const ky = Number(inputKy.value);
    const kz = Number(inputKz.value);
    const betaMe = Number(inputBetaMe.value);
    const rhoI = Number(inputRhoI.value);

    if (!Number.isFinite(dt) || !Number.isFinite(steps) || steps <= 0) {
      timeHint.textContent = 'tfinal = --, snapshots = --, interval = --';
      chipDt.textContent = '--';
      chipTfinal.textContent = '--';
      chipRefresh.textContent = '--';
      chipMethod.textContent = method || '--';
      chipDiscr.textContent = discr || '--';
      chipK.textContent = '--';
      chipBeta.textContent = '--';
      chipRho.textContent = '--';
      return;
    }

    const tfinal = dt * steps;
    const snapshotCount = computeSnapshotCount(steps, refreshSteps);
    const interval = snapshotCount > 1 ? Math.round(steps / (snapshotCount - 1)) : steps;
    timeHint.textContent = `tfinal = ${tfinal.toExponential(2)}, snapshots = ${snapshotCount}, interval = ${interval} steps`;
    chipDt.textContent = dt.toExponential(1);
    chipTfinal.textContent = tfinal.toExponential(1);
    chipRefresh.textContent = `${interval} steps`;
    chipMethod.textContent = method;
    chipDiscr.textContent = discr;
    if (Number.isFinite(kx) && Number.isFinite(ky) && Number.isFinite(kz)) {
      chipK.textContent = `${kx.toFixed(3)},${ky.toFixed(3)},${kz.toFixed(3)}`;
    } else {
      chipK.textContent = '--';
    }
    chipBeta.textContent = Number.isFinite(betaMe) ? betaMe.toFixed(2) : '--';
    chipRho.textContent = Number.isFinite(rhoI) ? rhoI.toFixed(2) : '--';
  }

  function updateSharedFrameUI() {
    const countZv = framesZv.length;
    const countXv = framesXv.length;

    plotZv.style.display = '';
    plotXv.style.display = '';
    const maxCount = Math.max(countZv, countXv);
    const minCount = Math.min(countZv || Infinity, countXv || Infinity);
    const usableCount = Number.isFinite(minCount) ? minCount : maxCount;

    frameCountZvEl.textContent = countZv ? String(countZv) : '--';
    frameCountXvEl.textContent = countXv ? String(countXv) : '--';

    if (!usableCount || usableCount <= 0) {
      frameSlider.min = '0';
      frameSlider.max = '0';
      frameSlider.value = '0';
      frameLabel.textContent = 'frame 0 / 0';
      renderEmpty(heatmap, 'No snapshots');
      renderEmpty(heatmapXv, 'No snapshots');
      return;
    }

    frameSlider.min = '0';
    frameSlider.max = String(usableCount - 1);
    frameSlider.value = String(usableCount - 1);
    renderAtIndex(usableCount - 1);
  }

  function renderAtIndex(idx) {
    const safeIdxZv = framesZv.length ? Math.max(0, Math.min(framesZv.length - 1, idx)) : -1;
    const safeIdxXv = framesXv.length ? Math.max(0, Math.min(framesXv.length - 1, idx)) : -1;

    const refFrame = safeIdxZv >= 0 ? framesZv[safeIdxZv] : (safeIdxXv >= 0 ? framesXv[safeIdxXv] : null);
    const labelMax = Math.max(0, Number(frameSlider.max || 0));
    frameLabel.textContent = `frame ${idx} / ${labelMax}` + (refFrame && refFrame.t != null ? ` (t=${refFrame.t.toExponential(2)})` : '');

    if (safeIdxZv >= 0) {
      renderHeatmap(framesZv[safeIdxZv], heatmap, legendEl, scaleZv.value, statsZv, zoomZv.value);
    } else {
      renderEmpty(heatmap, 'No snapshots');
    }

    if (safeIdxXv >= 0) {
      renderHeatmap(framesXv[safeIdxXv], heatmapXv, legendXvEl, scaleXv.value, statsXv, zoomXv.value);
    } else {
      renderEmpty(heatmapXv, 'No snapshots');
    }
  }

  async function runSimulation() {
    const nx = Number(inputNx.value);
    const ny = Number(inputNy.value);
    const nz = Number(inputNz.value);
    const nv = Number(inputNv.value);
    const rank = Number(inputRank.value);
    const kx = Number(inputKx.value);
    const ky = Number(inputKy.value);
    const kz = Number(inputKz.value);
    const betaMe = Number(inputBetaMe.value);
    const rhoI = Number(inputRhoI.value);
    const method = inputMethod.value;
    const discr = inputDiscr.value;
    const alpha = Number(inputAlpha.value);
    const dt = Number(inputDt.value);
    const steps = Number(inputSteps.value);
    const refreshSteps = Number(inputRefreshSteps.value);

    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz) || !Number.isFinite(nv)) {
      appendLog('Invalid grid values.', true);
      return;
    }
    if (!Number.isFinite(rank) || rank < 1) {
      appendLog('Invalid rank value.', true);
      return;
    }
    if (!Number.isFinite(kx) || !Number.isFinite(ky) || !Number.isFinite(kz)) {
      appendLog('Invalid kx/ky/kz values.', true);
      return;
    }
    if (!Number.isFinite(betaMe) || !Number.isFinite(rhoI)) {
      appendLog('Invalid betaMe or rho_i value.', true);
      return;
    }
    if (!method) {
      appendLog('Select a method.', true);
      return;
    }
    if (!discr) {
      appendLog('Select a discretization.', true);
      return;
    }
    if (!Number.isFinite(alpha)) {
      appendLog('Invalid alpha value.', true);
      return;
    }
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(steps) || steps <= 0) {
      appendLog('Invalid dt or steps value.', true);
      return;
    }

    runBtn.disabled = true;
    setStatus('Running...', 'run');
    clearLog();
    resetDiagnostics();
    jsRuntimeEl.textContent = '--';
    cppRuntimeEl.textContent = '--';
    jsHeapEl.textContent = '--';
    frameCountZvEl.textContent = '--';
    frameCountXvEl.textContent = '--';
    framesZv = [];
    framesXv = [];
    statsZv = null;
    statsXv = null;
    updateSharedFrameUI();

    const tfinal = dt * steps;
    const snapshotCount = computeSnapshotCount(steps, refreshSteps);
    const reportPoints = Math.max(1, snapshotCount);

    const args = [
      '--problem', 'alfven',
      '--method', method,
      '--deltat', dt.toString(),
      '--final_time', tfinal.toString(),
      '--rank', String(rank),
      '--n', `${nx},${ny},${nz},${nv}`,
      '--report_points', String(reportPoints),
      '--phi_basis', 'ensign',
      '--discretization', discr,
      '--alpha', alpha.toString(),
      '--kx', kx.toString(),
      '--ky', ky.toString(),
      '--kz', kz.toString(),
      '--betaMe', betaMe.toString(),
      '--rho_i', rhoI.toString(),
      '--blowup_guard', 'on',
      '--blowup_consec_reports', '1',
      '--blowup_max_epar', '200',
      '--blowup_max_dta', '200',
      '--blowup_minf_floor', '-0.005',
      '--snapshot_count', String(snapshotCount),
      '--snapshot_dir', '/snapshots',
      '--snapshot_plane', 'both',
      '--snapshot_emit_js',
    ];

    currentRunId += 1;
    runStart = performance.now();
    if (window.location.protocol === 'file:') {
      appendLog('Web Workers are blocked on file://. Open this folder with a local server (python -m http.server).', true);
      runBtn.disabled = false;
      setStatus('Idle');
      return;
    }
    const w = getWorker();
    w.postMessage({
      type: 'run',
      runId: currentRunId,
      args,
      snapshotCount,
    });
  }

  runBtn.addEventListener('click', () => {
    runSimulation();
  });

  frameSlider.addEventListener('input', () => renderAtIndex(Number(frameSlider.value)));
  scaleZv.addEventListener('change', () => renderAtIndex(Number(frameSlider.value)));
  scaleXv.addEventListener('change', () => renderAtIndex(Number(frameSlider.value)));
  zoomZv.addEventListener('change', () => renderAtIndex(Number(frameSlider.value)));
  zoomXv.addEventListener('change', () => renderAtIndex(Number(frameSlider.value)));
  inputKx.addEventListener('input', updateTimeHints);
  inputKy.addEventListener('input', updateTimeHints);
  inputKz.addEventListener('input', updateTimeHints);
  inputBetaMe.addEventListener('input', updateTimeHints);
  inputRhoI.addEventListener('input', updateTimeHints);
  inputMethod.addEventListener('change', updateTimeHints);
  inputDiscr.addEventListener('change', updateTimeHints);
  inputAlpha.addEventListener('input', updateTimeHints);
  inputDt.addEventListener('input', updateTimeHints);
  inputSteps.addEventListener('input', updateTimeHints);
  inputRefreshSteps.addEventListener('input', updateTimeHints);

  updateTimeHints();
  setStatus('Idle');
})();
