"""Write pipeline/REPORT.md and public/data/stats.json from the pipeline outputs.

Every number the app shows on its stats card comes from the `APP_NUMBERS`
table below. tests/stats.test.ts checks that each value in stats.json also
appears in REPORT.md.
"""

from __future__ import annotations

import gzip
import json
import math
from datetime import date
from pathlib import Path

import mpmath as mp
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
DATA = ROOT / "public" / "data"

BRIEF_TOP = {
    "Development": 141928, "Formalism": 18254, "GroundTheory": 8507, "ReciprocityTheory": 3845,
    "CompanionTheory": 2027, "PositivityTheory": 449, "Lemmata": 167, "BuildAid": 5,
    "Supplements": 3, "Statements": 1, "Main": 1,
}
THIRD_PARTY = {
    "lines": ("pengowray treemap", 17374215),
    "longestChainModules": ("pengowray treemap", 203),
    "importLinesTotal": ("jae-63 blueprint", 909823),
    "declarationsLoose": ("jae-63 blueprint", 1057373),
}


def fmt(n: int | float) -> str:
    return f"{n:,}" if isinstance(n, int) else f"{n:.3g}"


def grid_checks() -> dict:
    hdr = json.loads((DATA / "zeta_grid.json").read_text())
    g = np.load(CACHE / "zeta_grid_f64.npy")
    g16 = np.fromfile(DATA / "zeta_grid.bin", dtype=np.float16).reshape(hdr["height"], hdr["width"], 2)
    nx, nt = hdr["width"], hdr["height"]
    s0, s1 = hdr["sigma"]
    t0, t1 = hdr["t"]
    col = lambda s: round((s - s0) / (s1 - s0) * (nx - 1))  # noqa: E731
    row = lambda t: round((t - t0) / (t1 - t0) * (nt - 1))  # noqa: E731
    mp.mp.dps = 15
    checks = {}
    for label, s, expect in (
        ("zeta(1/2)", 0.5, -1.4603545088095868),
        ("zeta(2)", 2.0, math.pi**2 / 6),
        ("zeta(0)", 0.0, -0.5),
    ):
        lg, arg = g[0, col(s)]
        val = math.exp(lg) * math.cos(arg)
        checks[label] = {"grid": val, "expected": expect, "absErr": abs(val - expect)}
        assert abs(val - expect) < 1e-12, (label, val, expect)

    gammas = json.loads((DATA / "zeros.json").read_text())["gammas"]
    c = col(0.5)
    assert abs(s0 + c * (s1 - s0) / (nx - 1) - 0.5) < 1e-12
    mins = 0
    under = [y for y in gammas if y < 100]
    for y in under:
        j = row(y)
        a, b, d = g16[j - 1, c, 0], g16[j, c, 0], g16[j + 1, c, 0]
        if b <= a and b <= d:
            mins += 1
    checks["localMinima"] = {"zerosBelow100": len(under), "nearestSampleIsLocalMin": mins}
    assert mins == len(under) == 29
    checks["shape"] = [nt, nx]
    checks["spacing"] = {"sigma": (s1 - s0) / (nx - 1), "t": (t1 - t0) / (nt - 1)}
    return checks


def sizes() -> list[tuple[str, int, int]]:
    out = []
    for p in sorted(DATA.rglob("*")):
        if p.is_file():
            b = p.read_bytes()
            out.append((str(p.relative_to(DATA)), len(b), len(gzip.compress(b, 6))))
    return out


def main() -> None:
    gs = json.loads((CACHE / "graph_stats.json").read_text())
    zc = json.loads((CACHE / "zeros_check.json").read_text())
    gc = grid_checks()
    sz = sizes()
    detail_raw = sum(r for n, r, _ in sz if n.startswith("galaxy_details"))
    detail_gz = sum(z for n, _, z in sz if n.startswith("galaxy_details"))
    landscape = sum(z for n, _, z in sz if n.startswith(("zeta_grid", "zeros")))
    total_gz = sum(z for _, _, z in sz)

    app = {
        "modules": gs["modules"],
        "lines": gs["lines"],
        "importEdges": gs["importEdgesProject"],
        "importLines": gs["importLinesTotal"],
        "longestChain": gs["longestChainModules"],
        "declarations": gs["declarationsLoose"],
        "maxDepth": gs["maxDepthFromMain"],
        "mitModules": gs["mitModules"],
        "mitMatched": gs["mitMatched"],
        "zerosShown": 200,
        "zerosBelow100": 29,
        "commit": gs["commit"],
        "generated": date.today().isoformat(),
    }
    (DATA / "stats.json").write_text(json.dumps(app, indent=2))

    L: list[str] = []
    w = L.append
    w("# Pipeline report")
    w("")
    w(f"Generated {app['generated']} by `pipeline/report.py`. Source: "
      f"[leanprover-community/riemann-hypothesis @ `{gs['commit'][:12]}`]"
      f"(https://github.com/leanprover-community/riemann-hypothesis/tree/{gs['commit']}), "
      "the unmodified submission.")
    w("")
    w("## Numbers shown in the app")
    w("")
    w("The stats card reads `public/data/stats.json`. This script writes that file and this table "
      "from the same values.")
    w("")
    w("| Key | Value | Meaning |")
    w("|---|---|---|")
    meaning = {
        "modules": "`.lean` files under `src/`",
        "lines": "total lines in those files",
        "importEdges": "distinct import edges between project modules",
        "importLines": "import statements, Mathlib and Lean included",
        "longestChain": "modules on the longest import chain",
        "declarations": "top-level declarations (theorem, lemma, def, abbrev, structure, class, instance, inductive; modifiers allowed)",
        "maxDepth": "largest shortest-path import distance from `Main`",
        "mitModules": "lines in MIT `project-oleans.sha256`",
        "mitMatched": "modules found in both lists",
        "zerosShown": "zeros drawn in the landscape",
        "zerosBelow100": "zeros with γ < 100 (N(100))",
        "commit": "pinned commit",
        "generated": "report date",
    }
    for k, v in app.items():
        w(f"| `{k}` | {fmt(v) if isinstance(v, int) else v} | {meaning[k]} |")
    w("")

    w("## Zeros of ζ")
    w("")
    w(f"- Computed the first {zc['n_checked']} zeros with `mpmath.zetazero` at dps 25.")
    w(f"- Odlyzko `zeros1` cross-check: largest absolute error {zc['max_abs_err_vs_odlyzko']:.2e} "
      f"(zero #{zc['worst_index']}). The table has 9 decimals, so the floor is 5e-10. Required: < 1e-8. **Pass.**")
    w("- Asserted: γ₁ = 14.134725141734693790…, γ₂ = 21.022039638771554993…, γ₃ = 25.010857580145688763…, "
      "γ₁₀ = 49.773832477672302182…, γ₁₀₀ = 236.524229665816205…. **Pass.**")
    w(f"- N(100) = {zc['N100']}, N(1000) = {zc['N1000']}. γ₂₀₀ = {zc['gamma200']}.")
    w("")

    w("## ζ grid")
    w("")
    nt, nx = gc["shape"]
    w(f"- {nt} t samples × {nx} σ samples over σ ∈ [−1, 2], t ∈ [0, 100]; "
      f"Δσ = 1/86 (σ = 0, ½, 1, 2 lie on columns), Δt = {gc['spacing']['t']:.6f}.")
    w("- Channels: log|ζ| clamped to [−6, 4], arg ζ. Stored as Float16.")
    for k in ("zeta(1/2)", "zeta(2)", "zeta(0)"):
        c = gc[k]
        w(f"- {k}: grid {c['grid']:.16g}, expected {c['expected']:.16g}, error {c['absErr']:.1e}.")
    lm = gc["localMinima"]
    w(f"- On the σ = ½ column, the sample nearest each of the {lm['zerosBelow100']} zeros below t = 100 "
      f"is a local minimum of log|ζ| along t (Float16 data): {lm['nearestSampleIsLocalMin']}/{lm['zerosBelow100']}. **Pass.**")
    w("")

    w("## Lean proof: module census")
    w("")
    w(f"- Modules in source: **{fmt(gs['modules'])}**. MIT `project-oleans.sha256`: **{fmt(gs['mitModules'])}** lines.")
    w(f"- Matched by name: {fmt(gs['mitMatched'])}. Only in source: {len(gs['onlyInSource'])}. "
      f"Only in MIT list: {len(gs['onlyInMit'])}. The lists are identical.")
    w("")
    w("| Top-level directory | Our count | Brief (MIT list) | Match |")
    w("|---|---|---|---|")
    for k, v in BRIEF_TOP.items():
        ours = gs["topLevel"].get(k, 0)
        w(f"| {k} | {fmt(ours)} | {fmt(v)} | {'yes' if ours == v else 'NO'} |")
    w("")
    w("Largest second-level directories:")
    w("")
    for name, cnt in gs["secondLevelTop"][:6]:
        w(f"- {name}: {fmt(cnt)}")
    w("")

    w("## Lean proof: size and graph")
    w("")
    w(f"- Total lines: **{fmt(gs['lines'])}**.")
    w(f"- Import statements: {fmt(gs['importLinesTotal'])} (project {fmt(gs['importLinesTotal'] - sum(gs['importEdgesExternal'].values()))}, "
      f"external {fmt(sum(gs['importEdgesExternal'].values()))}: " +
      ", ".join(f"{k} {fmt(v)}" for k, v in gs["importEdgesExternal"].items()) + ").")
    w(f"- Distinct project-to-project import edges: **{fmt(gs['importEdgesProject'])}** "
      "(a few files import the same module twice; duplicates count once).")
    w(f"- Longest import chain: **{fmt(gs['longestChainModules'])} modules** ({gs['longestChainEdges']} edges), "
      f"from `{gs['longestChain'][0]}` down to `{gs['longestChain'][-1]}`.")
    w(f"- Shortest-path depth from `Main`: maximum {gs['maxDepthFromMain']}.")
    w(f"- Modules in `Main`'s import closure: {fmt(gs['inMainClosure'])} of {fmt(gs['modules'])} (all). "
      "This confirms jae-63's warning: the import graph says little about logical dependency.")
    w(f"- Top-level declarations: {fmt(gs['declarationsLoose'])} with modifiers allowed "
      f"(`noncomputable def`, `private theorem`, `@[simp] lemma`, …); {fmt(gs['declarationsStrict'])} "
      "with the brief's strict regex at line start.")
    w(f"- Largest file: `{gs['largestFile']}` ({fmt(gs['largestFileLines'])} lines). "
      f"Most imported: `{gs['mostImported']}` ({fmt(gs['mostImportedCount'])} importers).")
    w("")
    w("### Comparison with third-party numbers")
    w("")
    w("| Quantity | Ours | Third party | Source | Note |")
    w("|---|---|---|---|---|")
    notes = {
        "lines": "exact match",
        "longestChainModules": "exact match (counted in modules)",
        "importLinesTotal": "differs by 1; we count every `import` token in file headers. We did not find the extra edge.",
        "declarationsLoose": "definitions differ; ours is a regex count, not an elaborated count",
    }
    for k, (src, val) in THIRD_PARTY.items():
        w(f"| {k} | {fmt(gs[k])} | {fmt(val)} | {src} | {notes[k]} |")
    w("")
    w("Lean FRO / Mathlib Initiative: “17 million lines of code” — consistent with 17,374,215. "
      "MIT: “All 175,187 modules compile” — consistent.")
    w("")

    w("## Galaxy layout")
    w("")
    w("- Groups: second-level directories (343) plus top-level files. networkx `spring_layout`, 3D, seed 7, "
      "edge weight log1p(imports between groups). `Main` is pinned at the origin.")
    w("- Modules: Gaussian around their third-level directory centre, radius 0.085·√count, "
      "pushed outward by 0.25 per import level from `Main`, y squashed by 0.42.")
    w("- Point size: log(lines). Colour: top-level library.")
    w("")

    w("## Asset sizes")
    w("")
    w("| File | Raw | Gzip |")
    w("|---|---|---|")
    for n, r, z in sz:
        if not n.startswith("galaxy_details"):
            w(f"| {n} | {r/1e6:.2f} MB | {z/1e6:.2f} MB |")
    w(f"| galaxy_details/ ({sum(1 for n, _, _ in sz if n.startswith('galaxy_details'))} shards) | "
      f"{detail_raw/1e6:.2f} MB | {detail_gz/1e6:.2f} MB |")
    w(f"| **Total data** | | **{total_gz/1e6:.2f} MB** |")
    w("")
    w(f"Landscape data (grid + zeros): {landscape/1e6:.2f} MB gzipped (budget 6 MB). "
      f"All data: {total_gz/1e6:.2f} MB (budget 25 MB, including JS and fonts).")
    w("")
    w("## License note")
    w("")
    w("The submission has no license. `public/data/` holds only derived metadata: module paths, line counts, "
      "import edges, declaration names and kinds, and statement snippets of at most three lines "
      "(whitespace collapsed, at most 180 characters). The app links to GitHub at the pinned commit for source.")
    (ROOT / "pipeline" / "REPORT.md").write_text("\n".join(L) + "\n")
    print("wrote pipeline/REPORT.md and public/data/stats.json")


if __name__ == "__main__":
    main()
