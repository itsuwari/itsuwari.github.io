const path = require('path');
const fs = require('fs');

const here = __dirname;
const debugModulePath = path.join(here, 'alfven_wasm_debug.js');
const releaseModulePath = path.join(here, 'alfven_wasm.js');

let AlfvenModule;
let wasmBinary;
if (fs.existsSync(debugModulePath)) {
  AlfvenModule = require(debugModulePath);
} else {
  require(path.join(here, 'alfven_wasm_embed.js'));
  AlfvenModule = require(releaseModulePath);
  wasmBinary = globalThis.ALFVEN_WASM_BINARY || undefined;
}

const args = [
  '--problem', 'alfven',
  '--method', 'parallel_bug',
  '--deltat', '1e-5',
  '--final_time', '8e-4',
  '--rank', '8',
  '--n', '32,32,32,128',
  '--report_points', '8',
  '--snapshot_dir', '/snapshots',
  '--snapshot_plane', 'zv',
  '--snapshot_count', '1',
];

AlfvenModule({
  noInitialRun: true,
  wasmBinary,
  print: (text) => console.log(text),
  printErr: (text) => console.error(text),
}).then((mod) => {
  if (!mod.FS.analyzePath('/snapshots').exists) {
    mod.FS.mkdir('/snapshots');
  }
  try {
    mod.FS.unlink('/snapshots/snapshot_000.dat');
  } catch (err) {
    // ignore
  }

  console.log('Running args:', args.join(' '));
  mod.callMain(args);

  try {
    const snapshot = mod.FS.readFile('/snapshots/snapshot_000.dat', { encoding: 'utf8' });
    console.log(`Snapshot bytes: ${snapshot.length}`);
  } catch (err) {
    console.error('Snapshot read failed:', err.message || err);
  }
}).catch((err) => {
  console.error('Module init failed:', err && err.stack ? err.stack : err);
});
