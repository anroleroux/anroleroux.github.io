# CLAUDE.md

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

- **Organise `home.css` in this order:**
  1. **Variables** (`:root` — type scale, modular scale, colours, fonts)
  2. **General styles** — shared base rules used by every theme
  3. **Almanac variations** — only what differs from the general styles
  4. **Cosmos variations** — only what differs from the general styles
  5. **Responsive styles** — `@media` blocks

  The almanac and cosmos themes **inherit from the general styles** wherever possible.
  Put a rule in a theme section only when it overrides or extends a general style;
  shared rules belong in the general section.
