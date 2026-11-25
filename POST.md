# X post drafts — Riemann Explorer

Draft only. Paolo posts it himself.

Asset: `out/riemann-explorer.mp4` (16:9) or `out/riemann-explorer-4x5.mp4` (4:5, better in the feed). First frame is black for 1 s, so set the thumbnail to the aerial shot at ~3 s or the galaxy at ~38 s.

Placeholders: `{LINK}` = live URL. `@{ALPOGE}`, `@{LEAN}`, `@{MATHLIB}`, `@{SUTHERLAND}`, `@{PENGOWRAY}`, `@{DEEPTHEORY}`, `@{JAE63}` = handles to check before posting (do not guess them). Your usual style keeps links out of the body and in the reply; the brief asked for the link in each hook, so it is in the body here. Move it to the reply if you prefer.

Numbers used below all come from `pipeline/REPORT.md`: 175,187 modules, 17,374,215 lines, 29 zeros below t = 100, Z(t) computed live.

---

## Hook 1 — the brief's line, nearly as is

> Everyone's talking about the Riemann proof. Almost nobody can picture it. So I asked Claude Code to make it explorable!
>
> Fly up the critical line of ζ, watch the zeros tick past, then drop into all 175,187 modules of the Lean proof as a galaxy you can search and click.
>
> {LINK}

## Hook 2 — trend-jack + "turns out"

> Everyone's talking about the Riemann proof. Almost nobody can picture it, me included. So I asked Claude Code to make it explorable!
>
> Turns out 17 million lines of Lean look a lot like a galaxy. Every star is one module, click it and you get the path, the first theorems and the source on GitHub.
>
> {LINK}

## Hook 3 — shortest, video-first

> Everyone's talking about the Riemann proof. Almost nobody can picture it. So I asked Claude Code to make it explorable!
>
> 45 seconds from the zeta landscape to the 175,187-module proof by @{ALPOGE}, all rendered in the browser.
>
> {LINK}

---

## First reply (same for all three, post it in the same minute)

> Sources + credits:
> • Proof by @{ALPOGE}, working with Claude: alpo.ge/remark.pdf
> • Verified by @{LEAN} / @{MATHLIB}: leanprover-community.github.io/blog/posts/riemann-hypothesis/ and by @{SUTHERLAND} at MIT: math.mit.edu/~drew/grh/
> • Source at the original commit: github.com/leanprover-community/riemann-hypothesis
> • Earlier visualisations worth a look: @{PENGOWRAY}'s treemap, @{DEEPTHEORY}'s 3D map, @{JAE63}'s blueprint
>
> This visualises, it doesn't explain: the landscape isn't the proof's method, and imports say little about which modules the argument really needs. Counts are my own, from the source (they match the MIT list exactly).

## Optional second reply (for the maths crowd)

> The zeros are mpmath, checked against Odlyzko's tables to 5e-10. The Z(t) curve is computed live in your browser (Riemann–Siegel above t = 100, Euler–Maclaurin below), and the counter hits exactly 29 at t = 100.
