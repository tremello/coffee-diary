# Design rules

Every screen picks from this one small set. New screens and changes use these tokens; never add a new literal colour, corner size or text size.

## Colours (`src/styles/00-tokens.css`)
Use the role tokens. Each has a light value and a dark value, so dark mode follows by itself.

| Token | Use |
| --- | --- |
| `--c-ink` | main text |
| `--c-ink-strong` | strong secondary text |
| `--c-ink-2` | secondary text, labels |
| `--c-ink-3` | faint text, hints |
| `--c-brown-deep`, `--c-accent` | brown emphasis (numbers, links, roastery) |
| `--c-page` | page background |
| `--c-surface` | cards and sheets |
| `--c-soft` | soft fill inside a card |
| `--c-soft-2` | selected / pressed fill, segmented control track |
| `--c-fill` | tracks and meters |
| `--c-line` | default border and divider |
| `--c-line-strong` | input and outlined-button border |

Photo viewer (원두 카드 사진 보기, 모서리 맞추기): `--c-viewer` background and `--c-viewer-ink` text. They stay the same in light, dark and every colour theme, because a photo is judged on a dark backdrop.

State colours (green 소비 중, amber 디개싱, red delete/error), the calendar heat scale and the glass tab bar keep their own values. If a new colour is really needed, add it as a role token with both light and dark values.

### 시기 색 (맛있는 시기 stages)
A ripening order: amber (resting) → green (best) → olive (still fine) → plain brown-grey (past, never a warning red). Pills use `-bg` with `-fg`; timeline bars use `-bar`. Always show the stage words next to the colour.

| Token | Use |
| --- | --- |
| `--pk-rest-bg`, `--pk-rest-fg`, `--pk-rest-bar` | 쉬는 중 (same as the 디개싱 chip) |
| `--pk-best-bg`, `--pk-best-fg`, `--pk-best-bar` | 가장 좋은 때 (same as the 소비 중 chip) |
| `--pk-ok-bg`, `--pk-ok-fg`, `--pk-ok-bar` | 아직 괜찮음 |
| `--pk-past-bg`, `--pk-past-fg`, `--pk-past-bar` | 지남 (`--c-soft-2`, `--c-ink-2`, `--c-fill`) |

## Corners
- `--r-sm` (10px): buttons, inputs, search fields, segmented controls, blocks inside a card. Segment buttons inside use `calc(var(--r-sm) - 3px)`.
- `--r-md` (14px): cards.
- `--r-lg` (20px): sheets and dialogs (top corners only on phones).
- `--r-pill`: chips, tags, status badges, add buttons ("+ 새 레시피", "+ 원두 추가" floating button).

## Text sizes
- 24 page title · 17 card and sheet titles (700) · 15/16 body in lists · 13 buttons and small body · 12 secondary text and group labels (600) · 11 smallest (chips, captions). Nothing under 11px except icon glyphs.
- Form sheets (bean, brew, recipe): row names muted 14px on phones / 13px on PC, entered values dark and 500 weight. Inputs stay 16px on phones.
- The same role gets the same size on every screen.

## Segmented controls
One look: `--c-soft-2` track, no border, 3px padding, 12px text in `--c-ink-2`, selected = brown accent background with white 600 text.
