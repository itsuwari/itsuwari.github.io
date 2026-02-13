#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

SRC="${ROOT_DIR}/ttdl/src/alfven_eigen_demo.cpp"
OUT_DIR="${ROOT_DIR}/ttdl/web/alfven_wasm_demo"

emcc "${SRC}" \
  -O0 \
  -g3 \
  -std=c++17 \
  -DNDEBUG \
  -fexceptions \
  -s DISABLE_EXCEPTION_CATCHING=0 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=268435456 \
  -s MAXIMUM_MEMORY=1073741824 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=AlfvenModule \
  -s ENVIRONMENT=web,node \
  -s FORCE_FILESYSTEM=1 \
  -s NO_EXIT_RUNTIME=1 \
  -s STACK_SIZE=16777216 \
  -s ASSERTIONS=2 \
  -s SAFE_HEAP=1 \
  -s STACK_OVERFLOW_CHECK=2 \
  -s EXPORTED_RUNTIME_METHODS='["FS","callMain"]' \
  -I"${ROOT_DIR}/eigen" \
  -o "${OUT_DIR}/alfven_wasm_debug.js"

echo "Built ${OUT_DIR}/alfven_wasm_debug.js and ${OUT_DIR}/alfven_wasm_debug.wasm"
