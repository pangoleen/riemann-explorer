"""First zeros of ζ on the critical line, checked against Odlyzko's table.

Writes:
  public/data/zeros.json        first 200 γ_n, 15 significant digits (runtime)
  tests/fixtures/zeros.json     first 649 γ_n, 22 significant digits (tests)
  .cache/zeros_check.json       error summary used by REPORT.md
"""

from __future__ import annotations

import json
import urllib.request
from multiprocessing import Pool
from pathlib import Path

import mpmath as mp

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
ODLYZKO_URL = "https://www-users.cse.umn.edu/~odlyzko/zeta_tables/zeros1"
N_RUNTIME = 200
N_FIXTURE = 649  # every zero with γ < 1000 (N(1000) = 649)
DPS = 25

KNOWN = {
    1: "14.134725141734693790",
    2: "21.022039638771554993",
    3: "25.010857580145688763",
    10: "49.773832477672302182",
    100: "236.524229665816205",
}


def _zero(n: int) -> str:
    mp.mp.dps = DPS
    return mp.nstr(mp.zetazero(n).imag, 22, strip_zeros=False)


def odlyzko(n: int) -> list[float]:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / "odlyzko_zeros1.txt"
    if not path.exists():
        with urllib.request.urlopen(ODLYZKO_URL, timeout=60) as r:
            path.write_bytes(r.read())
    vals = [float(x) for x in path.read_text().split()[:n]]
    assert len(vals) == n
    return vals


def main() -> None:
    with Pool() as pool:
        gammas = pool.map(_zero, range(1, N_FIXTURE + 1))

    mp.mp.dps = DPS
    for n, ref in KNOWN.items():
        digits = len(ref.replace(".", "")) - 2
        assert abs(mp.mpf(gammas[n - 1]) - mp.mpf(ref)) < mp.mpf(10) ** -(digits - 3), (n, gammas[n - 1], ref)

    table = odlyzko(N_FIXTURE)
    errs = [abs(float(mp.mpf(g)) - o) for g, o in zip(gammas, table)]
    worst = max(errs)
    assert worst < 1e-8, f"Odlyzko mismatch {worst}"
    assert sum(1 for g in gammas if mp.mpf(g) < 100) == 29
    assert sum(1 for g in gammas if mp.mpf(g) < 1000) == 649

    (ROOT / "public" / "data").mkdir(parents=True, exist_ok=True)
    runtime = {
        "description": "Imaginary parts γ_n of the first nontrivial zeros ρ_n = 1/2 + iγ_n of ζ(s)",
        "source": "mpmath.zetazero (dps 25), cross-checked with Odlyzko zeros1",
        "count": N_RUNTIME,
        "gammas": [float(mp.nstr(mp.mpf(g), 15)) for g in gammas[:N_RUNTIME]],
    }
    (ROOT / "public" / "data" / "zeros.json").write_text(json.dumps(runtime, separators=(",", ":")))
    (ROOT / "tests" / "fixtures").mkdir(parents=True, exist_ok=True)
    (ROOT / "tests" / "fixtures" / "zeros.json").write_text(json.dumps({"gammas": gammas}, indent=0))
    summary = {
        "n_checked": N_FIXTURE,
        "max_abs_err_vs_odlyzko": worst,
        "worst_index": errs.index(worst) + 1,
        "gamma1": gammas[0],
        "gamma200": gammas[N_RUNTIME - 1],
        "N100": 29,
        "N1000": 649,
    }
    (CACHE / "zeros_check.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
