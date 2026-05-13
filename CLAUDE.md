# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A static personal website (GitHub Pages) for Anro le Roux — no build step, no framework, no package manager. Every file is served directly by GitHub Pages at `anroleroux.github.io`.

## Development

Preview locally with any static file server:

```bash
python3 -m http.server 8080
# or
npx serve .
```

There are no tests, no linters, and no CI beyond what GitHub Pages does on push.

## Architecture

### File layout

- `index.html` — homepage with hero + article cards
- `index.css` — shared stylesheet used by every page via `<link rel="stylesheet" href="/index.css"/>`
- `style.css` — older stylesheet (some pages use it; `index.css` is the canonical one going forward)
- `pic.html` — article: *Primes and Cryptography* (latest version)
- `pic-mod.js` — math utility functions extracted from `pic.html` (`gcd`, `isPrime`, `modInverse`, `modPow`, `plotGammaN`)
- `ccm.html` — article: *Code as a Career Multiplier* (latest version)
- `bom.html`, `unlog-mockup.html` — scratch/mockup files, not linked from the homepage
- `RSAAuth.svg` — diagram embedded in `pic.html`
- `*_v0.x.x.html` — archived old versions of articles (e.g. `pic_v0.1.6.html`, `ccm_v0.1.0.html`)

### Article versioning convention

Each article page has a version `<select>` that lets readers navigate to past snapshots. When a new major/minor version is ready:
1. Copy the current `<article>.html` to `<article>_v<semver>.html`
2. Add the new archived version as an `<option>` in the `<select>` inside the `article-info` div of the live file

Articles with a `0.x` major version are considered works-in-progress.

### Styling system

`index.css` uses CSS custom properties with a modular type scale (`--step-0` through `--step-17`, `--step--1` through `--step--6`) built on a `1.25` ratio. The active theme class on `<body>` is `sumner`; a `dark` class is defined but not wired to a toggle yet. Avoid overriding the type-scale variables inline — use the named steps.

Key semantic CSS classes:
- `.insight.block` — callout box for mathematical insights
- `.warning.block` — warning callout
- `.interactions` — wrapper for interactive UI controls (inputs, SVG canvases, output spans)
- `.figure-numbering` — caption container; the `index()` JS function auto-numbers these
- `.charta` — D3 chart container

### Interactive articles (pic.html)

`pic.html` pulls in two CDN libraries:
- **MathJax 4** — renders LaTeX math via `\(...\)` and `\[...\]` delimiters
- **D3 v7** — powers the modular-clock SVG and the γ-vs-n scatter plot

The `index()` function in the inline `<script>` auto-numbers headings, insight blocks, and figures, and builds the sidebar table of contents. Figure cross-references use `data-fid` attributes on `.figure-number` spans that are resolved after numbering runs.

The `pic-mod.js` module provides the cryptographic math primitives (`modPow` uses `BigInt` for large-number safety) and `plotGammaN()` which draws the D3 chart. `drawClock()` and `updateCalculations()` live inline in `pic.html` and call into `pic-mod.js`.

### Interactive articles (ccm.html)

`ccm.html` uses **D3 v7** only. The paradigm graph is a force-directed layout (`d3.forceSimulation`) with 16 nodes and ~40 edges defined as inline JS arrays. Clicking nodes/edges populates a detail panel below the SVG. Touch events are handled alongside click events for mobile.
