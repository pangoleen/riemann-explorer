"""Deterministic 3D galaxy layout for every module, plus runtime assets.

Method:
  1. Group modules by second-level directory ("Development.WeilBound").
     The few files at the top (Main, Statements) are their own groups.
  2. Run networkx spring_layout in 3D over the group graph
     (edge weight = log1p(import count between groups)), seed 7.
     Starting positions put each top-level library on its own arm angle.
  3. Inside a group, sub-groups (third-level directory) sit around the group
     centre; modules are Gaussian around their sub-group centre with
     radius ∝ sqrt(module count), and pushed outward by depth from Main.

Writes to public/data/:
  galaxy_positions.bin   Float32 x,y,z per module (sorted by module name)
  galaxy_meta.bin        Uint16 pairs: size code (log lines), library index
  galaxy_modules.json    names as directory table + leaf names
  galaxy_dir_edges.json  group centres and the top 2,000 group edges
  galaxy_imports.bin     import graph, CSR (fetched on first click)
  galaxy_details/NNN.json  per-module details in shards of 2,000 (fetched on click)
  galaxy_index.json      libraries, colours, counts, shard size, Main index
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
from collections import Counter, defaultdict
from pathlib import Path

import networkx as nx
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
OUT = ROOT / "public" / "data"
SEED = 7
SHARD = 2000
GROUP_SCALE = 150.0     # world radius of the group layout
CLUSTER_K = 0.085       # group radius = CLUSTER_K * sqrt(count)
DEPTH_PUSH = 0.25       # outward push per import level from Main
FLATTEN_Y = 0.42        # squash the galaxy into a thick disc

LIBRARIES = [
    "Development", "Formalism", "GroundTheory", "ReciprocityTheory", "CompanionTheory",
    "PositivityTheory", "Lemmata", "BuildAid", "Supplements", "Statements", "Main",
]
COLOURS = [  # one per library, tuned for additive blending on black
    "#6fa8ff", "#ff9f5a", "#7be0b0", "#e07bff", "#ffd86b",
    "#ff6b8b", "#9ee8ff", "#c0c0c0", "#ffffff", "#ffffff", "#ffffff",
]


def group_of(name: str) -> str:
    parts = name.split(".")
    return ".".join(parts[:2]) if len(parts) > 2 else (parts[0] if len(parts) == 1 else ".".join(parts[:-1]))


def sub_of(name: str) -> str:
    parts = name.split(".")
    return ".".join(parts[:3]) if len(parts) > 3 else group_of(name)


def unit_hash(key: str, salt: str) -> np.ndarray:
    """A deterministic unit vector from a string."""
    h = hashlib.sha256((salt + key).encode()).digest()
    u, v = int.from_bytes(h[:4], "little") / 2**32, int.from_bytes(h[4:8], "little") / 2**32
    th, z = 2 * math.pi * u, 2 * v - 1
    r = math.sqrt(1 - z * z)
    return np.array([r * math.cos(th), z, r * math.sin(th)])


def main() -> None:
    rows = json.load(open(CACHE / "modules.json"))
    rows.sort(key=lambda r: r["name"])
    index = {r["name"]: i for i, r in enumerate(rows)}
    n = len(rows)

    groups = Counter(group_of(r["name"]) for r in rows)
    gw: Counter = Counter()
    for r in rows:
        a = group_of(r["name"])
        for d in r["projImports"]:
            b = group_of(d)
            if a != b:
                gw[tuple(sorted((a, b)))] += 1

    G = nx.Graph()
    for g in sorted(groups):
        G.add_node(g)
    for (a, b), w in gw.items():
        G.add_edge(a, b, weight=math.log1p(w))

    lib_angle = {lib: 2 * math.pi * i / 6 for i, lib in enumerate(LIBRARIES[:6])}
    init = {}
    for g in G.nodes:
        lib = g.split(".")[0]
        ang = lib_angle.get(lib, 0.0)
        jitter = unit_hash(g, "init")
        rad = 0.15 if lib in ("Main", "Statements", "Supplements", "BuildAid") else 0.7
        init[g] = np.array([rad * math.cos(ang), 0.0, rad * math.sin(ang)]) + 0.25 * jitter
    init["Main"] = np.zeros(3)
    pos = nx.spring_layout(
        G, dim=3, pos=init, fixed=["Main"], weight="weight", k=0.5, iterations=200, seed=SEED
    )
    P = np.array([pos[g] for g in G.nodes])
    P -= pos["Main"]
    scale = GROUP_SCALE / np.percentile(np.linalg.norm(P, axis=1), 95)
    centre = {g: (pos[g] - pos["Main"]) * scale * np.array([1, FLATTEN_Y, 1]) for g in G.nodes}

    # sub-group centres around their group centre
    subs = Counter(sub_of(r["name"]) for r in rows)
    sub_centre = {}
    for s, cnt in subs.items():
        g = s if s in groups else ".".join(s.split(".")[:2])
        rg = CLUSTER_K * math.sqrt(groups[g])
        off = unit_hash(s, "sub") * np.array([1, FLATTEN_Y, 1])
        frac = 0.0 if s == g else 0.75 * (1 - math.sqrt(cnt / groups[g]))
        sub_centre[s] = centre[g] + off * rg * frac

    rng = np.random.default_rng(SEED)
    xyz = np.zeros((n, 3), dtype=np.float32)
    mean_depth = defaultdict(list)
    for r in rows:
        mean_depth[sub_of(r["name"])].append(r["depth"])
    mean_depth = {k: float(np.mean(v)) for k, v in mean_depth.items()}
    for i, r in enumerate(rows):
        s = sub_of(r["name"])
        c = sub_centre[s]
        rad = CLUSTER_K * math.sqrt(subs[s])
        p = c + rng.normal(size=3) * rad * np.array([1, FLATTEN_Y, 1])
        out = c / (np.linalg.norm(c) + 1e-6)
        p = p + out * (r["depth"] - mean_depth[s]) * DEPTH_PUSH
        xyz[i] = p
    xyz[index["Main"]] = 0.0

    lib_idx = {lib: i for i, lib in enumerate(LIBRARIES)}
    meta = np.zeros((n, 2), dtype=np.uint16)
    for i, r in enumerate(rows):
        meta[i, 0] = min(65535, int(round(math.log(r["lines"] + 1) * 4096)))
        meta[i, 1] = lib_idx[r["name"].split(".")[0]]

    OUT.mkdir(parents=True, exist_ok=True)
    xyz.astype("<f4").tofile(OUT / "galaxy_positions.bin")
    meta.astype("<u2").tofile(OUT / "galaxy_meta.bin")

    # names: directory table + leaves
    dirs = sorted({r["name"].rpartition(".")[0] for r in rows})
    dir_idx = {d: i for i, d in enumerate(dirs)}
    names = {
        "dirs": dirs,
        "dir": [dir_idx[r["name"].rpartition(".")[0]] for r in rows],
        "leaf": [r["name"].rpartition(".")[2] for r in rows],
    }
    (OUT / "galaxy_modules.json").write_text(json.dumps(names, separators=(",", ":"), ensure_ascii=False))

    # group edges (top 2,000)
    gnames = sorted(groups)
    gi = {g: i for i, g in enumerate(gnames)}
    top_edges = sorted(gw.items(), key=lambda kv: -kv[1])[:2000]
    dir_edges = {
        "groups": [
            {"name": g, "count": groups[g], "c": [round(float(v), 3) for v in centre[g]],
             "lib": lib_idx[g.split(".")[0]]}
            for g in gnames
        ],
        "edges": [[gi[a], gi[b], w] for (a, b), w in top_edges],
        "totalGroupEdges": len(gw),
    }
    (OUT / "galaxy_dir_edges.json").write_text(json.dumps(dir_edges, separators=(",", ":")))

    # import graph as CSR: Uint32 offsets[n + 1], then Uint32 targets
    offs = [0]
    flat: list[int] = []
    for r in rows:
        flat.extend(sorted(index[x] for x in r["projImports"]))
        offs.append(len(flat))
    with open(OUT / "galaxy_imports.bin", "wb") as f:
        f.write(np.array(offs, dtype="<u4").tobytes())
        f.write(np.array(flat, dtype="<u4").tobytes())

    det_dir = OUT / "galaxy_details"
    if det_dir.exists():
        shutil.rmtree(det_dir)
    det_dir.mkdir()
    for k in range(0, n, SHARD):
        shard = []
        for i in range(k, min(n, k + SHARD)):
            r = rows[i]
            shard.append({
                "l": r["lines"],
                "d": r["depth"],
                "nd": r["nDecl"],
                "ex": sorted({x for x in r["imports"] if x not in index}),
                "dc": r["decls"],
                "sn": r["snippet"],
            })
        (det_dir / f"{k // SHARD:03d}.json").write_text(json.dumps(shard, separators=(",", ":"), ensure_ascii=False))

    lib_counts = Counter(r["name"].split(".")[0] for r in rows)
    idx = {
        "count": n,
        "shardSize": SHARD,
        "mainIndex": index["Main"],
        "libraries": [{"name": l, "colour": c, "count": lib_counts[l]} for l, c in zip(LIBRARIES, COLOURS)],
        "sizeScale": 4096,
        "bounds": {"min": xyz.min(0).round(2).tolist(), "max": xyz.max(0).round(2).tolist()},
        "highlights": {
            name: index[name]
            for name in (
                "Main", "Statements", "Supplements.Kernels.MainTheorems",
                "Development.AutomorphicArithmetic.CharacterBoxes.MainConclusion",
            )
        },
        "groupCentres": {g: [round(float(v), 3) for v in centre[g]] for g in
                         ("Development.AbelianVarietyTheory", "Development.AutomorphicSpectrum",
                          "Development.AutomorphicArithmetic", "Formalism.LocalToGlobal")},
    }
    (OUT / "galaxy_index.json").write_text(json.dumps(idx, indent=1))
    print(json.dumps({k: v for k, v in idx.items() if k != "libraries"}, indent=1))


if __name__ == "__main__":
    main()
