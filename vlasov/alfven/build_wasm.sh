#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

SRC="${ROOT_DIR}/ttdl/src/alfven_eigen_demo.cpp"
OUT_DIR="${ROOT_DIR}/ttdl/web/alfven_wasm_demo"

emcc "${SRC}" \
  -O3 \
  -std=c++17 \
  -DNDEBUG \
  -fexceptions \
  -s DISABLE_EXCEPTION_CATCHING=0 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=268435456 \
  -s MAXIMUM_MEMORY=1073741824 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=AlfvenModule \
  -s ENVIRONMENT=web \
  -s FORCE_FILESYSTEM=1 \
  -s NO_EXIT_RUNTIME=1 \
  -s STACK_SIZE=16777216 \
  -s ASSERTIONS=0 \
  -s EXPORTED_RUNTIME_METHODS='["FS","callMain"]' \
  -I"${ROOT_DIR}/eigen" \
  -o "${OUT_DIR}/alfven_wasm.js"

export OUT_DIR
python3 - <<'PY'
from pathlib import Path
import base64
import os

out_dir = Path(os.environ["OUT_DIR"])
wasm_path = out_dir / "alfven_wasm.wasm"
embed_path = out_dir / "alfven_wasm_embed.js"

if not wasm_path.exists():
    raise FileNotFoundError(f"Expected wasm output missing: {wasm_path}")

data = wasm_path.read_bytes()
b64 = base64.b64encode(data).decode("ascii")
with embed_path.open("w", encoding="utf-8") as f:
    f.write("globalThis.ALFVEN_WASM_BASE64 = \"")
    f.write(b64)
    f.write("\";\n")
    f.write("globalThis.ALFVEN_WASM_BINARY = Uint8Array.from(atob(globalThis.ALFVEN_WASM_BASE64), c => c.charCodeAt(0));\n")
print(f"Embedded wasm to {embed_path}")
PY

echo "Built ${OUT_DIR}/alfven_wasm.js and ${OUT_DIR}/alfven_wasm.wasm"
