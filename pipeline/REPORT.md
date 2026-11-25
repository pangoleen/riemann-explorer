# Pipeline report

Generated 2026-11-25 by `pipeline/report.py`. Source: [leanprover-community/riemann-hypothesis @ `40e56bab0265`](https://github.com/leanprover-community/riemann-hypothesis/tree/40e56bab026552e089d7afcfeff08d2defb9c005), the unmodified submission.

## Numbers shown in the app

The stats card reads `public/data/stats.json`. This script writes that file and this table from the same values.

| Key | Value | Meaning |
|---|---|---|
| `modules` | 175,187 | `.lean` files under `src/` |
| `lines` | 17,374,215 | total lines in those files |
| `importEdges` | 753,261 | distinct import edges between project modules |
| `importLines` | 909,822 | import statements, Mathlib and Lean included |
| `longestChain` | 203 | modules on the longest import chain |
| `declarations` | 1,061,425 | top-level declarations (theorem, lemma, def, abbrev, structure, class, instance, inductive; modifiers allowed) |
| `maxDepth` | 43 | largest shortest-path import distance from `Main` |
| `mitModules` | 175,187 | lines in MIT `project-oleans.sha256` |
| `mitMatched` | 175,187 | modules found in both lists |
| `zerosShown` | 200 | zeros drawn in the landscape |
| `zerosBelow100` | 29 | zeros with γ < 100 (N(100)) |
| `commit` | 40e56bab026552e089d7afcfeff08d2defb9c005 | pinned commit |
| `generated` | 2026-11-25 | report date |

## Zeros of ζ

- Computed the first 649 zeros with `mpmath.zetazero` at dps 25.
- Odlyzko `zeros1` cross-check: largest absolute error 5.00e-10 (zero #440). The table has 9 decimals, so the floor is 5e-10. Required: < 1e-8. **Pass.**
- Asserted: γ₁ = 14.134725141734693790…, γ₂ = 21.022039638771554993…, γ₃ = 25.010857580145688763…, γ₁₀ = 49.773832477672302182…, γ₁₀₀ = 236.524229665816205…. **Pass.**
- N(100) = 29, N(1000) = 649. γ₂₀₀ = 396.3818542225921869320.

## ζ grid

- 4097 t samples × 259 σ samples over σ ∈ [−1, 2], t ∈ [0, 100]; Δσ = 1/86 (σ = 0, ½, 1, 2 lie on columns), Δt = 0.024414.
- Channels: log|ζ| clamped to [−6, 4], arg ζ. Stored as Float16.
- zeta(1/2): grid -1.460354508809587, expected -1.460354508809587, error 0.0e+00.
- zeta(2): grid 1.644934066848226, expected 1.644934066848226, error 0.0e+00.
- zeta(0): grid -0.5, expected -0.5, error 0.0e+00.
- On the σ = ½ column, the sample nearest each of the 29 zeros below t = 100 is a local minimum of log|ζ| along t (Float16 data): 29/29. **Pass.**

## Lean proof: module census

- Modules in source: **175,187**. MIT `project-oleans.sha256`: **175,187** lines.
- Matched by name: 175,187. Only in source: 0. Only in MIT list: 0. The lists are identical.

| Top-level directory | Our count | Brief (MIT list) | Match |
|---|---|---|---|
| Development | 141,928 | 141,928 | yes |
| Formalism | 18,254 | 18,254 | yes |
| GroundTheory | 8,507 | 8,507 | yes |
| ReciprocityTheory | 3,845 | 3,845 | yes |
| CompanionTheory | 2,027 | 2,027 | yes |
| PositivityTheory | 449 | 449 | yes |
| Lemmata | 167 | 167 | yes |
| BuildAid | 5 | 5 | yes |
| Supplements | 3 | 3 | yes |
| Statements | 1 | 1 | yes |
| Main | 1 | 1 | yes |

Largest second-level directories:

- Development.AbelianVarietyTheory: 99,187
- Development.AutomorphicArithmetic: 18,431
- Development.AutomorphicSpectrum: 15,147
- Development.WeilBound: 7,051
- GroundTheory.HeightsAndTheta: 6,410
- Formalism.LocalToGlobal: 5,501

## Lean proof: size and graph

- Total lines: **17,374,215**.
- Import statements: 909,822 (project 753,569, external 156,253: Lean 12, Mathlib 156,238, Batteries 3).
- Distinct project-to-project import edges: **753,261** (a few files import the same module twice; duplicates count once).
- Longest import chain: **203 modules** (202 edges), from `Main` down to `ReciprocityTheory.ReductiveGroups.ArithmeticGeometry.SemiabelianSchemes.SplitTori.SplitTorusAff`.
- Shortest-path depth from `Main`: maximum 43.
- Modules in `Main`'s import closure: 175,187 of 175,187 (all). This confirms jae-63's warning: the import graph says little about logical dependency.
- Top-level declarations: 1,061,425 with modifiers allowed (`noncomputable def`, `private theorem`, `@[simp] lemma`, …); 981,308 with the brief's strict regex at line start.
- Largest file: `Formalism.HermitianCurvature.HermitianCurvatureProofs.IsAdmissibleSplittingCharPairMulTwist` (17,981 lines). Most imported: `Development.AbelianVarietyTheory.Definitions.Divisors.CTSmallCone` (3,088 importers).

### Comparison with third-party numbers

| Quantity | Ours | Third party | Source | Note |
|---|---|---|---|---|
| lines | 17,374,215 | 17,374,215 | pengowray treemap | exact match |
| longestChainModules | 203 | 203 | pengowray treemap | exact match (counted in modules) |
| importLinesTotal | 909,822 | 909,823 | jae-63 blueprint | differs by 1; we count every `import` token in file headers. We did not find the extra edge. |
| declarationsLoose | 1,061,425 | 1,057,373 | jae-63 blueprint | definitions differ; ours is a regex count, not an elaborated count |

Lean FRO / Mathlib Initiative: “17 million lines of code” — consistent with 17,374,215. MIT: “All 175,187 modules compile” — consistent.

## Galaxy layout

- Groups: second-level directories (343) plus top-level files. networkx `spring_layout` in the disc plane (2D), seed 7, edge weight log1p(imports between groups). `Main` is pinned at the origin. A spiral twist (1.1 rad at the 95th-percentile radius) is applied for the look; it keeps neighbours together.
- Modules: Gaussian around their third-level directory centre, radius 0.12·√count, pushed outward by 0.22 per import level from `Main`, y squashed by 0.32.
- Point size: log(lines). Colour: top-level library.

## Asset sizes

| File | Raw | Gzip |
|---|---|---|
| galaxy_dir_edges.json | 0.04 MB | 0.01 MB |
| galaxy_imports.bin | 3.71 MB | 1.41 MB |
| galaxy_index.json | 0.00 MB | 0.00 MB |
| galaxy_meta.bin | 0.70 MB | 0.27 MB |
| galaxy_modules.json | 6.47 MB | 1.27 MB |
| galaxy_positions.bin | 2.10 MB | 1.96 MB |
| stats.json | 0.00 MB | 0.00 MB |
| zeros.json | 0.00 MB | 0.00 MB |
| zeta_grid.bin | 4.24 MB | 3.74 MB |
| zeta_grid.json | 0.00 MB | 0.00 MB |
| galaxy_details/ (88 shards) | 46.27 MB | 10.26 MB |
| **Total data** | | **18.92 MB** |

Landscape data (grid + zeros): 3.74 MB gzipped (budget 6 MB). All data: 18.92 MB (budget 25 MB, including JS and fonts).

## License note

The submission has no license. `public/data/` holds only derived metadata: module paths, line counts, import edges, declaration names and kinds, and statement snippets of at most three lines (whitespace collapsed, at most 180 characters). The app links to GitHub at the pinned commit for source.
