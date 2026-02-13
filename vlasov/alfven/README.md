# Alfven WASM Demo

This folder contains the WebAssembly demo of the `ttdl` solver (`ttdl/src/alfven_eigen_demo.cpp`) plus a minimal UI.

## Build

You need Emscripten (`emcc`) on your `PATH`.

```bash
./build_wasm.sh
```

The build outputs `alfven_wasm.js` and `alfven_wasm.wasm` in this folder.

## Run

`build_wasm.sh` produces `alfven_wasm.js` plus an embedded payload file
`alfven_wasm_embed.js` (the wasm is base64-embedded), so `index.html` can be
opened directly from disk with `file://` (no server required).

## Hosted + Compressed Build (Optional)

If you can serve files over HTTP, you can use the hosted build (smaller transfer size):

```bash
./build_wasm_hosted.sh
```

This first runs `build_wasm.sh` (so `alfven_wasm.js`, `alfven_wasm.wasm`, and
`alfven_wasm_embed.js` stay in sync), then creates optional `.gz` / `.br` files.
If you serve them with the correct
`Content-Encoding`, the browser will use the compressed transfer automatically.

## Source of Truth

- WASM source target: `ttdl/src/alfven_eigen_demo.cpp`
- WASM demo location: `ttdl/web/alfven_wasm_demo`

## Notes

- Defaults: grid `32 32 32 128`, rank `2`, method `strang_mrap` (`parallel_bug` is second and `lie` is third in the dropdown), `dt=5e-5`, `steps=200` (`tfinal=1e-2`), `betaMe=1.0`, `rho_i=2.0`, `alpha=0.1`.
- Method, phi basis, discretization, and alpha are adjustable from the UI.
- `refresh steps` controls how often snapshots are taken (slider lets you scrub frames after the run).
- Both `f(z,v)` and `f(x,v)` are generated in a single run and saved into a single snapshot file per time step.
- Snapshots are also streamed to the UI in real time when running in the browser.
- If plots look static, try `delta vs first` scaling or increase `steps` / `dt`.
- Simulation runs in a Web Worker so the UI stays responsive and logs stream live.
- Energy and conservation plots are derived from the diagnostics stream (`t=...` lines).
- Blowup guard is enabled by default in the solver; if triggered, the run stops early and the UI status shows a stop reason.
