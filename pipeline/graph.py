"""Extract module metadata and the import graph from the Lean source.

Source: leanprover-community/riemann-hypothesis at the pinned commit
40e56bab026552e089d7afcfeff08d2defb9c005 (the unmodified submission).
Run `python pipeline/graph.py --fetch` to sparse-clone src/ into .cache/rh-src.

Only derived metadata leaves this script: module names, paths, line counts,
import edges, declaration names and kinds, and statement snippets of at most
three lines. No .lean source is copied into public/.

Writes .cache/modules.json (consumed by layout.py) and .cache/graph_stats.json
(consumed by report.py).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import urllib.request
from collections import Counter, deque
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
REPO = "https://github.com/leanprover-community/riemann-hypothesis.git"
COMMIT = "40e56bab026552e089d7afcfeff08d2defb9c005"
SRC = CACHE / "rh-src" / "src"
OLEANS_URL = "https://math.mit.edu/~drew/grh/project-oleans.sha256"

# The regex from the brief, anchored at line start.
DECL_STRICT = re.compile(r"^(theorem|lemma|def|abbrev|structure|class|instance|inductive)\s+(\S+)")
# Same kinds, but also allowing attributes and modifiers in front (e.g. `noncomputable def`).
DECL_LOOSE = re.compile(
    r"^(?:@\[[^\]]*\]\s*)?"
    r"(?:(?:private|protected|noncomputable|partial|unsafe|nonrec|scoped|local)\s+)*"
    r"(theorem|lemma|def|abbrev|structure|class|instance|inductive)\b\s*(\S*)"
)
IMPORT = re.compile(r"^(?:public\s+|meta\s+|private\s+)*import\s+(.+)$")
SNIPPET_MAX_LINES = 3
SNIPPET_MAX_CHARS = 120
SNIPPET_MAX_TOTAL = 180
WS = re.compile(r"\s+")


def fetch() -> None:
    dest = CACHE / "rh-src"
    if (dest / "src" / "Main.lean").exists():
        print("source already present")
        return
    dest.mkdir(parents=True, exist_ok=True)
    run = lambda *a: subprocess.run(a, cwd=dest, check=True)  # noqa: E731
    run("git", "init", "-q")
    run("git", "remote", "add", "origin", REPO)
    run("git", "sparse-checkout", "set", "--no-cone", "/src/", "/lakefile.toml", "/lean-toolchain")
    run("git", "fetch", "--depth", "1", "--filter=blob:none", "origin", COMMIT)
    run("git", "checkout", "-q", "FETCH_HEAD")


def parse(path: Path) -> dict:
    rel = path.relative_to(SRC).with_suffix("")
    name = ".".join(rel.parts)
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    n_lines = len(lines) - (1 if text.endswith("\n") else 0)

    imports: list[str] = []
    in_block = False
    body_start = 0
    for i, raw in enumerate(lines):
        line = raw.strip()
        if in_block:
            if "-/" in line:
                in_block = False
            continue
        if not line or line.startswith("--"):
            continue
        if line.startswith("/-"):
            if "-/" not in line[2:]:
                in_block = True
            continue
        m = IMPORT.match(line)
        if m:
            imports.extend(tok for tok in m.group(1).split() if not tok.startswith("--"))
            continue
        if line in ("prelude", "module"):
            continue
        body_start = i
        break
    else:
        body_start = len(lines)

    decls: list[list[str]] = []
    n_decl_loose = 0
    n_decl_strict = 0
    snippet = None
    for i in range(body_start, len(lines)):
        raw = lines[i]
        if DECL_STRICT.match(raw):
            n_decl_strict += 1
        m = DECL_LOOSE.match(raw)
        if not m:
            continue
        n_decl_loose += 1
        kind, ident = m.group(1), m.group(2)
        if not ident or ident[0] in ":[({⦃":
            ident = "(anonymous)"
        if len(decls) < 3:
            decls.append([kind, ident])
        if snippet is None and kind in ("theorem", "lemma"):
            snippet = statement_snippet(lines, i)
    return {
        "name": name,
        "path": "/".join(rel.parts),
        "lines": n_lines,
        "imports": imports,
        "decls": decls,
        "nDecl": n_decl_loose,
        "nDeclStrict": n_decl_strict,
        "snippet": snippet,
    }


def statement_snippet(lines: list[str], start: int) -> str:
    """At most three lines of a theorem statement, cut at `:=`."""
    out: list[str] = []
    budget = SNIPPET_MAX_TOTAL
    for raw in lines[start : start + SNIPPET_MAX_LINES]:
        if out and not raw.startswith((" ", "\t")):
            break
        cut = raw.find(":=")
        piece = raw if cut < 0 else raw[:cut]
        piece = WS.sub(" ", piece.strip())
        if out:
            piece = "  " + piece
        limit = min(SNIPPET_MAX_CHARS, budget)
        if len(piece) > limit:
            piece = piece[: max(0, limit - 1)] + "…"
        if piece.strip():
            out.append(piece)
            budget -= len(piece)
        if cut >= 0 or budget <= 1:
            break
    return "\n".join(out[:SNIPPET_MAX_LINES])


def mit_modules() -> list[str]:
    path = CACHE / "project-oleans.sha256"
    if not path.exists():
        with urllib.request.urlopen(OLEANS_URL, timeout=120) as r:
            path.write_bytes(r.read())
    names = []
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        _, p = line.split(None, 1)
        p = p.strip().removeprefix("./").removesuffix(".olean")
        names.append(p.replace("/", "."))
    return names


def longest_chain(mods: dict[str, dict]) -> tuple[int, list[str]]:
    """Longest import path (in edges) through the project DAG."""
    order = topo_order(mods)
    best: dict[str, int] = {}
    nxt: dict[str, str | None] = {}
    for m in reversed(order):  # dependencies first
        b, n = 0, None
        for d in mods[m]["projImports"]:
            if best[d] + 1 > b:
                b, n = best[d] + 1, d
        best[m], nxt[m] = b, n
    start = max(best, key=best.get)
    chain = [start]
    while nxt[chain[-1]] is not None:
        chain.append(nxt[chain[-1]])
    return best[start], chain


def topo_order(mods: dict[str, dict]) -> list[str]:
    """Importers before importees (Kahn). Raises if a cycle exists."""
    indeg = Counter()
    for m in mods.values():
        for d in m["projImports"]:
            indeg[d] += 1
    q = deque(sorted(n for n in mods if indeg[n] == 0))
    order = []
    while q:
        n = q.popleft()
        order.append(n)
        for d in mods[n]["projImports"]:
            indeg[d] -= 1
            if indeg[d] == 0:
                q.append(d)
    assert len(order) == len(mods), "import cycle"
    return order


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch", action="store_true")
    args = ap.parse_args()
    if args.fetch or not (SRC / "Main.lean").exists():
        fetch()

    files = sorted(SRC.rglob("*.lean"))
    with Pool() as pool:
        rows = pool.map(parse, files, chunksize=256)
    mods = {r["name"]: r for r in rows}

    ext = Counter()
    n_edges_all = 0
    for r in rows:
        r["projImports"] = sorted({i for i in r["imports"] if i in mods})
        n_edges_all += len(r["imports"])
        for i in r["imports"]:
            if i not in mods:
                ext[i.split(".")[0]] += 1
    importers = Counter()
    for r in rows:
        for d in r["projImports"]:
            importers[d] += 1
    for r in rows:
        r["importedBy"] = importers[r["name"]]

    # depth = shortest import distance from Main
    depth = {"Main": 0}
    q = deque(["Main"])
    while q:
        n = q.popleft()
        for d in mods[n]["projImports"]:
            if d not in depth:
                depth[d] = depth[n] + 1
                q.append(d)
    for r in rows:
        r["depth"] = depth.get(r["name"], -1)

    chain_len, chain = longest_chain(mods)

    mit = mit_modules()
    mit_set, ours = set(mit), set(mods)
    top = Counter(r["name"].split(".")[0] for r in rows)
    second = Counter(".".join(r["name"].split(".")[:2]) for r in rows if "." in r["name"])
    stats = {
        "commit": COMMIT,
        "modules": len(rows),
        "lines": sum(r["lines"] for r in rows),
        "importLinesTotal": n_edges_all,
        "importEdgesProject": sum(len(r["projImports"]) for r in rows),
        "importEdgesExternal": dict(ext),
        "declarationsLoose": sum(r["nDecl"] for r in rows),
        "declarationsStrict": sum(r["nDeclStrict"] for r in rows),
        "longestChainEdges": chain_len,
        "longestChainModules": chain_len + 1,
        "longestChain": chain,
        "maxDepthFromMain": max(depth.values()),
        "inMainClosure": len(depth),
        "mitModules": len(mit),
        "mitMatched": len(ours & mit_set),
        "onlyInSource": sorted(ours - mit_set)[:50],
        "onlyInMit": sorted(mit_set - ours)[:50],
        "topLevel": dict(top.most_common()),
        "secondLevelTop": second.most_common(12),
        "largestFile": max(rows, key=lambda r: r["lines"])["name"],
        "largestFileLines": max(r["lines"] for r in rows),
        "mostImported": sorted(rows, key=lambda r: -r["importedBy"])[0]["name"],
        "mostImportedCount": max(r["importedBy"] for r in rows),
    }
    CACHE.mkdir(exist_ok=True)
    (CACHE / "modules.json").write_text(json.dumps(rows, separators=(",", ":")))
    (CACHE / "graph_stats.json").write_text(json.dumps(stats, indent=2))
    print(json.dumps({k: v for k, v in stats.items() if k != "longestChain"}, indent=2))


if __name__ == "__main__":
    main()
