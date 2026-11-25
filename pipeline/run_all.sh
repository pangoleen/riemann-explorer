#!/usr/bin/env bash
# Regenerate every asset under public/data/ and pipeline/REPORT.md.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PY:-.venv/bin/python}
if [ ! -x "$PY" ]; then
  uv venv -p 3.13 .venv
  uv pip install -p .venv/bin/python -r pipeline/requirements.txt
fi
mkdir -p .cache
$PY pipeline/rs_coeffs.py
$PY pipeline/zeros.py
$PY pipeline/ref_values.py
[ -f public/data/zeta_grid.bin ] && [ "${REGRID:-0}" = 0 ] || $PY pipeline/zeta_grid.py
$PY pipeline/graph.py
$PY pipeline/layout.py
$PY pipeline/report.py
$PY -m pytest -q pipeline/test_pipeline.py
