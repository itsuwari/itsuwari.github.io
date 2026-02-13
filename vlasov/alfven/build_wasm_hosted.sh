#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

OUT_DIR="${ROOT_DIR}/ttdl/web/alfven_wasm_demo"

# Always reuse the same compile path as build_wasm.sh so JS/WASM/embed stay in sync.
"${SCRIPT_DIR}/build_wasm.sh"

pushd "${OUT_DIR}" >/dev/null
if command -v brotli >/dev/null 2>&1; then
  brotli -f -q 11 alfven_wasm.wasm
  brotli -f -q 11 alfven_wasm.js
fi

gzip -kf -9 alfven_wasm.wasm
gzip -kf -9 alfven_wasm.js
popd >/dev/null

echo "Built hosted files in ${OUT_DIR} (optional .br/.gz created)."
