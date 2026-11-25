# Riemann Explorer — verification report

Written 2026-11-25 17:30 UTC. Every value below comes from running the code, the tests or the tools named next to it on this date. Items not checked are marked **UNVERIFIED**. The pipeline's own numbers report is [`pipeline/REPORT.md`](pipeline/REPORT.md).

## 1. Zero accuracy

Commands: `.venv/bin/python -m pytest -q pipeline/test_pipeline.py` → **7 passed**. `pnpm test` → **28 passed** (zeta, search, stats, story).

First 10 zeros and zero #100: `mpmath.zetazero` at dps 25 against Odlyzko's `zeros1` table (9 decimals):

| n | γₙ (mpmath, dps 25) | Odlyzko | abs. error |
|---|---|---|---|
| 1 | 14.13472514173469379046 | 14.134725142 | 2.7e-10 |
| 2 | 21.02203963877155499263 | 21.022039639 | 2.3e-10 |
| 3 | 25.01085758014568876321 | 25.010857580 | 1.5e-10 |
| 4 | 30.42487612585951321031 | 30.424876126 | 1.4e-10 |
| 5 | 32.93506158773918969066 | 32.935061588 | 2.6e-10 |
| 6 | 37.58617815882567125722 | 37.586178159 | 1.7e-10 |
| 7 | 40.91871901214749518740 | 40.918719012 | 1.5e-10 |
| 8 | 43.32707328091499951950 | 43.327073281 | 8.5e-11 |
| 9 | 48.00515088116715972794 | 48.005150881 | 1.7e-10 |
| 10 | 49.77383247767230218192 | 49.773832478 | 3.3e-10 |
| 100 | 236.5242296658162058025 | 236.524229666 | 1.8e-10 |

- First zero: **14.134725141734693790…** Confirmed (asserted in `pipeline/zeros.py` and `pipeline/test_pipeline.py`, along with γ₂, γ₃, γ₁₀ and γ₁₀₀).
- Max absolute error over all 649 zeros below t = 1000: **5.0e-10** (zero #440). This is the rounding floor of a 9-decimal table. Required: < 1e-8. **Pass.**
- Zeros below t = 100: **29**. Zeros below t = 1000: **649**. Each is counted two ways and both agree:
  - from the zero table (`zerosPassed`, the function the HUD counter uses);
  - from sign changes of the browser's own TypeScript Z(t), with no table (`countZeros`).
- TypeScript Z(t) against `mpmath.siegelz` at 50 points in [10, 1000]: worst error **1.38e-8** (limit 1e-6).
- Sign changes of the TypeScript Z(t), refined by bisection, reproduce the first 100 zeros to < 1e-6. **Pass.**
- θ(t) against `mpmath.siegeltheta`: < 1e-9 at all 50 points. **Pass.**
- Visual alignment (`pnpm test:visual`, top-down screenshot): **29/29** markers found. Worst distance from a surface minimum: **0.71 px** (tolerance 2 px). **Pass.**

## 2. Module count

- The galaxy on the **live site** loads **175,187** modules. A headless Chrome run read `galaxy.index.count`, the positions buffer and the drawn point count: all three are 175,187.
- `.lean` files under `src/` at the pinned commit: **175,187**.
- MIT `project-oleans.sha256`: **175,187** lines.
- Matched by name: **175,187**. Only in the source: 0. Only in the MIT list: 0. **The lists are identical.**
- Per top-level directory, every count matches the table in the brief: Development 141,928 … Main 1.

## 3. Recomputed stats

Computed by `pipeline/graph.py`, which parses every `.lean` file at the pinned commit.

| Shown in app | Our value | How we got it | Third-party value |
|---|---|---|---|
| Modules | **175,187** | count of `src/**/*.lean` | MIT: 175,187 (match) |
| Lines | **17,374,215** | lines per file, summed | pengowray: 17,374,215 (exact match) |
| Import edges | **753,261** | distinct `import` targets that are project modules, per file, summed (duplicates in one file count once) | no direct equivalent |
| Longest import chain | **203 modules** (202 edges) | longest path in the project import DAG (topological order + dynamic programming). It runs from `Main` to `ReciprocityTheory.ReductiveGroups.ArithmeticGeometry.SemiabelianSchemes.SplitTori.SplitTorusAff` | pengowray: 203 (exact match) |

Also computed, but **not shown on the stats card**:

- **Import statements: 909,822**, Mathlib/Lean/Batteries included. These are every `import` token in a file header. jae-63 reports 909,823. We did not find the extra one. **UNVERIFIED** which count is right.
- **Top-level declarations: 1,061,425.** This is a regex for `theorem|lemma|def|abbrev|structure|class|instance|inductive` at line start, with attributes and modifiers allowed. With the brief's strict regex the count is 981,308. jae-63 reports 1,057,373. The definitions differ: ours is a text count, not an elaborated one.
- **Shortest-path depth from Main:** maximum 43.
- **Main's import closure:** all 175,187 modules are in it.

`tests/stats.test.ts` checks that every value in `public/data/stats.json` (the stats card's source) appears in `pipeline/REPORT.md`. **Pass.** On the live site the card reads: 175,187 · 17,374,215 · 753,261 · 203 modules.

## 4. Pinned source

- Repo: **https://github.com/leanprover-community/riemann-hypothesis**
- Commit: **`40e56bab026552e089d7afcfeff08d2defb9c005`**. Commit message: "Mirror the submission exactly as published". `git rev-parse HEAD` in `.cache/rh-src` returns this hash.
- Every "View source on GitHub" link uses `…/blob/40e56bab026552e089d7afcfeff08d2defb9c005/src/<path>.lean`. The live end-to-end test fetched the MainConclusion link: **HTTP 200**.

## 5. Licensing check

- `.lean` files tracked in the git repo: **0**. `.lean` files in `public/` or the deployed `dist/`: **0**.
- `public/data/` holds only derived metadata: module paths, line counts, import edges (binary), declaration kinds and names (first 3 per module), depth, and statement snippets. There are 165,801 snippets. The longest has **3 lines** and **182 characters** (measured over every shard). The README previously said 180; this is now corrected.
- The galaxy UI links to GitHub at the pinned commit for full source.
- Things that are, or could be read as, copied text:
  1. **The statement snippets themselves.** These are up to 3 lines from the first theorem of each module, cut at `:=`. This follows the brief's rule, but they are verbatim fragments of the unlicensed submission. 165,801 of them are deployed.
  2. **The final Lean card** (`index.html`) shows one full line from the submission's `src/Main.lean`: `theorem riemannHypothesis : RiemannHypothesis := rhOfAll`. That is 1 line, inside the 3-line rule, but verbatim.
  3. **The Mathlib `RiemannHypothesis` definition** on the same card is from Mathlib (Apache-2.0), not from the submission. Its line breaks are re-wrapped so it fits the 4:5 frame; the tokens are unchanged.
  4. **`tests/fixtures/` and `pipeline/` contain no Lean text.** `src/math/rsCoeffs.ts` holds numbers generated by our own script.

## 6. Credits

Searched in the built page (`dist/index.html`, About card) and `README.md`:

| Credit | About card | README |
|---|---|---|
| Levent Alpöge | yes | yes |
| Lean FRO / Mathlib Initiative statement (linked) | yes (also on the stats card) | yes |
| Andrew (Drew) Sutherland, MIT verification (linked) | yes, as "Andrew Sutherland" / "MIT (Sutherland)" | yes |
| DeepTheory Labs 3D map | yes | yes |
| pengowray treemap | yes | yes |
| jae-63 blueprint | yes | yes |

The About card and README both say no code or data from the prior projects is used.

## 7. Links

- Live site: **https://riemann-explorer-psi.vercel.app**. HTTP 200. Headless Chrome loads it and the full galaxy check passes (search, fly-to, click, panel, GitHub link 200, pick 1.6 ms, no page errors).
- Repo: **https://github.com/pangoleen/riemann-explorer**. It is **PRIVATE**, as the brief asked ("the private GitHub repo"). It loads for the account owner (`gh repo view` OK, last push 17:13 UTC). An anonymous request returns **404**. **It is not public.** Make it public in GitHub settings if you want to link it in the post.

## 8. Video

Checked with `ffprobe` (all frames decoded and counted):

| File | Resolution | Duration | Frames | fps | Codec | Size |
|---|---|---|---|---|---|---|
| `out/riemann-explorer.mp4` | 1920×1080 | 45.000 s | 2,700 | 60 | H.264, yuv420p, CRF 16 | 276.6 MB |
| `out/riemann-explorer-4x5.mp4` | 1080×1350 | 45.000 s | 2,700 | 60 | H.264, yuv420p, CRF 16 | 211.1 MB |
| `out/riemann-explorer-preview.mp4` | 1920×1080 | 45.000 s | — | 60 | H.264 ~4.4 Mbps | 24.8 MB |
| `out/riemann-explorer-4x5-preview.mp4` | 1080×1350 | 45.000 s | — | 60 | H.264 ~4.4 Mbps | 24.7 MB |

Capture time: 3.0 min (16:9) and 2.5 min (4:5) for 2,700 frames each, plus encoding. Time comes from the frame index, so no frame can drop. `tests/story.test.ts` checks that the camera speed changes by at most **2.49 units/s** between consecutive frames (limit 3).

Captions, in order (from `src/story/timeline.ts`):

1. 1.2–4.9 s — "This is the Riemann zeta function."
2. 6.4–16.6 s — "Every zero we've ever found sits on one line. Re(s) = ½."
3. 17.3–21.9 s — "For 167 years nobody could prove they all do."
4. 23.0–29.7 s — "Last week a proof landed. 17 million lines of Lean, written with Claude."
5. 30.6–39.6 s — "175,187 modules. Every one checked by machine."
6. 41.4–44.2 s — "Q.E.D."

Other on-screen text in the video:

- "Zeros passed N" and the Z(t) plot with γ labels, about 8.8–23 s;
- labels "Re(s) = ½", "σ = 0", "σ = 1", "ζ(−2) = 0 · trivial zero" and "Main.lean";
- the Lean card: the Mathlib file path, the `RiemannHypothesis` definition, the `riemannHypothesis` theorem line, and "src/Main.lean · Alpöge, with Claude · 20 Nov 2026".

Caption 4 says "Last week". That is true only if you post between 23 and 29 Nov 2026, since the proof was released on 20 Nov.

## 9. Build time

From git: first commit `0a4608d` at **2026-11-25 16:35:26 UTC**, last commit `61da2ee` at 17:13:22 UTC. Report written 17:30 UTC. **First commit to now: 0 h 55 min (0.92 h).** Work before the first commit (fetching sources, writing the pipeline, computing the grid) is not in git; its length is **UNVERIFIED** from git timestamps.

## 10. Known issues

1. **Lighthouse performance is 73, below the target of 80.** Desktop preset, live site. Accessibility is 100, best practices 100, LCP 0.6 s, CLS 0, but total blocking time is 440 ms. Diagnosis: in headless Chrome, creating the WebGL context (`new THREE.WebGLRenderer`) blocks the main thread for about 5.4 s, measured with performance marks. I have not checked whether this happens in a normal, visible Chrome window: **UNVERIFIED**. Not fixed.
2. **Performance targets measured only on an M1 Max**, at 1920×1080 with a GPU sync per frame: landscape 4.7 ms, galaxy 3.4 ms. 60 fps on a base M1 MacBook Pro and 30 fps on integrated graphics: **UNVERIFIED**.
3. **"First meaningful paint under 2 s"**: Lighthouse LCP is 0.6 s, but that is a text element. The time until the 3D landscape is first drawn is affected by issue 1. **UNVERIFIED** in a real browser.
4. **A stray Vercel project (resolved).** One deploy went to a new project named `dist`, because the build wiped the project link. It was deleted at 17:38 UTC with the owner's approval; its alias now returns 404. `pnpm run deploy` now links the right project every time.
5. **Approximations (documented in the README):**
   - Surface height is ½·log(|ζ|² + ε²) with ε = 0.16, not raw log|ζ|. The minima are at exactly the same points; without this, the pits are too narrow to see.
   - Below t = 100, Z(t) uses Euler–Maclaurin, not Riemann–Siegel. C0–C4 alone is 1.5e-5 off at t = 10. Below t = 10 it uses the grid.
   - The trivial zero ζ(−2) is an off-grid marker, because the grid starts at σ = −1.
   - The galaxy layout has a spiral twist for the look.
6. **Optional "spine" overlay not done**: no declaration chain from `riemannHypothesis`. Everything else on the cut list (4:5 export, trivial zero, edge curvature) is done.
7. **Story HUD under `hideui=1`.** The Z(t) panel and zero counter stay visible, because the script makes them part of the film. All other chrome is hidden.
8. **Import-statement count** differs from jae-63 by 1 (909,822 vs 909,823). Not resolved. This number is not on the stats card.
9. **POST.md** has `{LINK}` and @-handle placeholders. I did not look up the handles.
10. **Uncommitted at time of writing:** the faster grid decode, timing marks and the `deploy` script. These are committed together with this report. The live site still has the old grid decode, which gives the same output.
11. **Frame 0 of each video is black** (fade-in). Pick a thumbnail at about 3 s.
