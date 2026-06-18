# CLAUDE.md

## Structure

The page is built from these top-level elements, in order:

```text
body
├── .sun-panel-toggle      — button that opens/closes the sun panel
├── #sun-panel             — the sun panel
└── #live-wrapper          — holds the two switchable theme layers
    ├── #alm-layer.almanac — the almanac layer
    │   ├── nav
    │   ├── header
    │   │   └── div.head
    │   │       ├── div.eyebrow
    │   │       ├── div.title
    │   │       ├── div.blurb
    │   │       └── div.meta
    │   ├── section
    │   │   ├── div.head
    │   │   └── div.work
    │   ├── div.meta
    │   ├── div.toc
    │   ├── article
    │   │   └── section
    │   │       ├── div.head
    │   │       │   ├── div.eyebrow
    │   │       │   ├── div.title
    │   │       │   ├── div.blurb
    │   │       │   └── div.meta
    │   │       └── div.work
    │   └── footer
    └── #cos-layer.cosmos  — the cosmos layer (same set of inner elements)
```

- The **sun-panel toggle button** sits directly under `body` and controls `#sun-panel`.
- `#sun-panel` is a sibling of `#live-wrapper`, also directly under `body`.
- `#live-wrapper` contains the two theme layers, `#alm-layer.almanac` and
  `#cos-layer.cosmos`. Only one is shown at a time — the user **switches between** them.
- Each layer is built from these elements: `nav`, `header`, `section`, `div.meta`,
  `div.toc`, `article`, and `footer`.
- An `article` can contain `section` elements, and each `section` can contain
  `div.head` and `div.work` elements. The layer's top-level `header` and `section`
  elements can likewise contain `div.head` and `div.work` (and their children).
- A `div.head` can contain `div.eyebrow`, `div.title`, `div.blurb`, and `div.meta`
  elements.
  
**Not all of them need to be present** in a given layer and downwards.
Also, **other `div` elements may also appear** in between.

## Styling

- **Reuse `home.css`.** Before writing any style, check whether `home.css` already
  provides it (a class, a variable, an existing rule). Use what's there. If a needed
  style does not exist, **ask the human** whether to add it to `home.css` or inline in
  the HTML file — do not decide on your own.

- **Use modular scaling for spacing.** All regular sizes (padding, margin, gap, etc.)
  must use the `--ms*` modular-scale variables (`--ms-7` … `--ms7`, with `--ms0` = base).
  Do not hard-code rem/px values for spacing. If no step fits, **ask the human**.

- **Use `--ts*` for font sizes.** Always size type with the `--ts*` variables
  (e.g. `--ts15`, `--ts36`). Never hard-code font sizes.

- **Scope theme styles with descendant selectors.** Write theme-specific rules as
  `.almanac .eyebrow {}` / `.cosmos .eyebrow {}`, not with prefixed flat class names
  like `.alm-eyebrow {}`.

- **Organise `home.css` in this order:**
  1. **Variables** (`:root` — type scale, modular scale, colours, fonts)
  2. **General styles** — shared base rules used by every theme
  3. **Almanac variations** — only what differs from the general styles
  4. **Cosmos variations** — only what differs from the general styles
  5. **Responsive styles** — `@media` blocks

  The almanac and cosmos themes **inherit from the general styles** wherever possible.
  Put a rule in a theme section only when it overrides or extends a general style;
  shared rules belong in the general section.
