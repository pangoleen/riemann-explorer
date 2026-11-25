"""ζ(σ + it) on a grid over σ ∈ [−1, 2], t ∈ [0, 100].

The σ spacing is 1/86, so σ = 0, 1/2, 1 and 2 fall exactly on grid columns.
Writes public/data/zeta_grid.bin (Float16 pairs: log|ζ| clamped, arg ζ),
row-major with one row per t sample, and zeta_grid.json (header).
"""

from __future__ import annotations

import json
import math
import time
from multiprocessing import Pool
from pathlib import Path

import mpmath as mp
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"

SIGMA_MIN, SIGMA_MAX = -1.0, 2.0
T_MIN, T_MAX = 0.0, 100.0
NX = 259            # σ samples: spacing 3/258 = 1/86
NT = 4097           # t samples: spacing 100/4096
LOG_MIN, LOG_MAX = -6.0, 4.0


def sigma_at(i: int) -> float:
    return SIGMA_MIN + i * (SIGMA_MAX - SIGMA_MIN) / (NX - 1)


def t_at(j: int) -> float:
    return T_MIN + j * (T_MAX - T_MIN) / (NT - 1)


def row(j: int) -> np.ndarray:
    mp.mp.dps = 15
    t = t_at(j)
    out = np.empty((NX, 2), dtype=np.float64)
    for i in range(NX):
        s = mp.mpc(sigma_at(i), t)
        if abs(s - 1) < 1e-12:
            out[i] = (LOG_MAX, 0.0)
            continue
        z = mp.zeta(s)
        a = abs(z)
        lg = LOG_MIN if a == 0 else float(mp.log(a))
        out[i] = (min(max(lg, LOG_MIN), LOG_MAX), float(mp.arg(z)) if a != 0 else 0.0)
    return out


def main() -> None:
    t0 = time.time()
    with Pool() as pool:
        rows = pool.map(row, range(NT), chunksize=8)
    grid = np.stack(rows)  # (NT, NX, 2)
    OUT.mkdir(parents=True, exist_ok=True)
    grid.astype(np.float16).tofile(OUT / "zeta_grid.bin")
    np.save(ROOT / ".cache" / "zeta_grid_f64.npy", grid)
    header = {
        "format": "float16 RG, row-major, rows = t, columns = sigma",
        "channels": ["log|zeta| clamped", "arg zeta (radians, -pi..pi)"],
        "width": NX,
        "height": NT,
        "sigma": [SIGMA_MIN, SIGMA_MAX],
        "t": [T_MIN, T_MAX],
        "logClamp": [LOG_MIN, LOG_MAX],
        "dps": 15,
    }
    (OUT / "zeta_grid.json").write_text(json.dumps(header, indent=2))
    print(f"grid {NT}x{NX} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
