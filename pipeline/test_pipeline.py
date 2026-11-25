"""Pipeline accuracy checks (pytest)."""

from __future__ import annotations

import json
import math
from pathlib import Path

import mpmath as mp
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
CACHE = ROOT / ".cache"


def test_known_zeros() -> None:
    mp.mp.dps = 25
    g = json.loads((ROOT / "tests" / "fixtures" / "zeros.json").read_text())["gammas"]
    assert abs(mp.mpf(g[0]) - mp.mpf("14.134725141734693790")) < 1e-17
    assert abs(mp.mpf(g[1]) - mp.mpf("21.022039638771554993")) < 1e-17
    assert abs(mp.mpf(g[2]) - mp.mpf("25.010857580145688763")) < 1e-17
    assert abs(mp.mpf(g[9]) - mp.mpf("49.773832477672302182")) < 1e-17
    assert abs(mp.mpf(g[99]) - mp.mpf("236.524229665816205")) < 1e-14


def test_odlyzko() -> None:
    g = json.loads((ROOT / "tests" / "fixtures" / "zeros.json").read_text())["gammas"]
    table = [float(x) for x in (CACHE / "odlyzko_zeros1.txt").read_text().split()[: len(g)]]
    assert max(abs(float(a) - b) for a, b in zip(g, table)) < 1e-8


def test_runtime_zeros_15_digits() -> None:
    rt = json.loads((DATA / "zeros.json").read_text())["gammas"]
    fx = json.loads((ROOT / "tests" / "fixtures" / "zeros.json").read_text())["gammas"]
    assert len(rt) == 200
    for a, b in zip(rt, fx):
        assert abs(a - float(b)) / float(b) < 5e-15


def _grid():
    hdr = json.loads((DATA / "zeta_grid.json").read_text())
    g = np.fromfile(DATA / "zeta_grid.bin", dtype=np.float16).reshape(hdr["height"], hdr["width"], 2)
    return hdr, g.astype(np.float64)


def test_grid_special_values() -> None:
    hdr, g = _grid()
    nx = hdr["width"]
    col = lambda s: round((s + 1) / 3 * (nx - 1))  # noqa: E731
    for s, expect in ((0.5, -1.4603545088095868), (2.0, math.pi**2 / 6), (0.0, -0.5)):
        lg, arg = g[0, col(s)]
        val = math.exp(lg) * math.cos(arg)
        assert abs(val - expect) < 2e-3 * abs(expect)  # Float16 storage
    f64 = np.load(CACHE / "zeta_grid_f64.npy")
    for s, expect in ((0.5, -1.4603545088095868), (2.0, math.pi**2 / 6), (0.0, -0.5)):
        lg, arg = f64[0, col(s)]
        assert abs(math.exp(lg) * math.cos(arg) - expect) < 1e-12


def test_grid_minima_at_zeros() -> None:
    hdr, g = _grid()
    nx, nt = hdr["width"], hdr["height"]
    c = round(1.5 / 3 * (nx - 1))
    zeros = [y for y in json.loads((DATA / "zeros.json").read_text())["gammas"] if y < 100]
    assert len(zeros) == 29
    for y in zeros:
        j = round(y / 100 * (nt - 1))
        assert g[j, c, 0] <= g[j - 1, c, 0] and g[j, c, 0] <= g[j + 1, c, 0], y


def test_module_census() -> None:
    s = json.loads((CACHE / "graph_stats.json").read_text())
    assert s["modules"] == 175187 == s["mitModules"] == s["mitMatched"]
    assert s["onlyInSource"] == [] and s["onlyInMit"] == []
    assert s["topLevel"]["Development"] == 141928


def test_no_lean_source_in_public() -> None:
    assert not list(DATA.rglob("*.lean"))
    shard = json.loads((DATA / "galaxy_details" / "000.json").read_text())
    for row in shard:
        if row["sn"]:
            assert row["sn"].count("\n") <= 2 and len(row["sn"]) <= 200
