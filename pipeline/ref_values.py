"""Reference values from mpmath for the TypeScript maths tests.

Writes tests/fixtures/zeta_ref.json: siegelz and siegeltheta at 50 points in
[10, 1000] (deterministic) at dps 30.
"""

from __future__ import annotations

import json
from pathlib import Path

import mpmath as mp
import numpy as np

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    mp.mp.dps = 30
    rng = np.random.default_rng(2026)
    # 25 log-spaced points plus 25 random ones, so both ends are covered
    ts = sorted(set(np.round(np.geomspace(10, 1000, 25), 6).tolist() +
                    np.round(rng.uniform(10, 1000, 25), 6).tolist()))
    assert len(ts) == 50
    out = {
        "t": ts,
        "Z": [float(mp.siegelz(t)) for t in ts],
        "theta": [float(mp.siegeltheta(t)) for t in ts],
    }
    path = ROOT / "tests" / "fixtures" / "zeta_ref.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=1))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
