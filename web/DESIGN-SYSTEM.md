# Voucha Design System

Interactive design-system, component, autocomplete, shell, and entity permutations live in Storybook. In local development, start the web app and open `/storybook/`. CI publishes the current successful `main` static build to the private, Basic Auth-gated `https://voucha-storybook.pages.dev/`; the trusted publisher validates the artifact and injects the Pages Function. Pull requests receive Storybook build and browser validation only. Hosted PR previews are disabled because they would execute contributor-controlled JavaScript after a reviewer enters the shared credentials. See [docs/operations/private-docs-site.md](../docs/operations/private-docs-site.md).

## Brand Identity

**Voucha** = trust through transparency. Real people vouching for things they know — reviews, data points, and recommendations grounded in lived experience. The UI should feel credible, legible, and purposeful.

**Design principles:**

- **Trust-first.** The interface earns confidence through clarity and restraint. Nothing flashy; everything intentional.
- **Signal, not noise.** Accents are warm gold — small, intentional, never overwhelming. Gold is reserved for CTA buttons and focus rings. Text links and inline accents stay neutral for readability.
- **Density.** Information is tightly organized. Spacing is compact and consistent. No wasted space.
- **Precision over playfulness.** Clean edges, tight radii, restrained animation. Credibility is conveyed through calm.
- **Connectedness.** Subtle borders and dividers link content nodes — vouches that connect people to knowledge.

## Color System

### Dark mode (primary — canonical experience)

| Token                      | HSL           | Role                                 |
| -------------------------- | ------------- | ------------------------------------ |
| `--background`             | `230 15% 4%`  | Deep space void                      |
| `--foreground`             | `210 20% 93%` | Primary text (silver)                |
| `--card`                   | `230 12% 7%`  | Elevated surface                     |
| `--card-foreground`        | `210 20% 93%` | Card text                            |
| `--popover`                | `230 12% 9%`  | Popover/dropdown bg                  |
| `--popover-foreground`     | `210 20% 93%` | Popover text                         |
| `--primary`                | `43 90% 55%`  | Star gold — CTA buttons, focus rings |
| `--primary-foreground`     | `230 15% 4%`  | Text on gold                         |
| `--secondary`              | `230 10% 12%` | Subtle surface                       |
| `--secondary-foreground`   | `210 15% 80%` | Text on secondary                    |
| `--muted`                  | `230 10% 12%` | Muted backgrounds                    |
| `--muted-foreground`       | `215 10% 48%` | Secondary text                       |
| `--accent`                 | `230 10% 14%` | Hover/active state bg                |
| `--accent-foreground`      | `210 20% 93%` | Text on accent                       |
| `--destructive`            | `0 62% 50%`   | Error/danger                         |
| `--destructive-foreground` | `0 0% 98%`    | Text on destructive                  |
| `--border`                 | `230 10% 15%` | Structural borders                   |
| `--input`                  | `230 10% 15%` | Input borders                        |
| `--ring`                   | `43 90% 55%`  | Focus ring (gold)                    |

### Light mode

| Token                      | HSL           | Role               |
| -------------------------- | ------------- | ------------------ |
| `--background`             | `220 20% 97%` | Cool off-white     |
| `--foreground`             | `230 15% 10%` | Near-black text    |
| `--card`                   | `0 0% 100%`   | White card         |
| `--card-foreground`        | `230 15% 10%` | Card text          |
| `--popover`                | `0 0% 100%`   | White popover      |
| `--popover-foreground`     | `230 15% 10%` | Popover text       |
| `--primary`                | `40 85% 40%`  | Deeper gold        |
| `--primary-foreground`     | `0 0% 100%`   | White on gold      |
| `--secondary`              | `220 15% 93%` | Light gray surface |
| `--secondary-foreground`   | `230 15% 10%` | Text on secondary  |
| `--muted`                  | `220 15% 93%` | Muted bg           |
| `--muted-foreground`       | `215 10% 42%` | Secondary text     |
| `--accent`                 | `220 15% 90%` | Hover bg           |
| `--accent-foreground`      | `230 15% 10%` | Text on accent     |
| `--destructive`            | `0 84% 60%`   | Red                |
| `--destructive-foreground` | `0 0% 98%`    | Text on red        |
| `--border`                 | `220 15% 88%` | Subtle border      |
| `--input`                  | `220 15% 88%` | Input border       |
| `--ring`                   | `40 85% 40%`  | Gold focus ring    |

## Typography

| Name          | Class                                                               | Usage                         |
| ------------- | ------------------------------------------------------------------- | ----------------------------- |
| Page title    | `text-2xl font-bold tracking-tight`                                 | H1 on pages                   |
| Section title | `text-lg font-semibold tracking-tight`                              | H2, card groups               |
| Card title    | `text-base font-semibold`                                           | Post titles, entity names     |
| Body          | `text-sm`                                                           | Default body text             |
| Caption       | `text-xs text-muted-foreground`                                     | Timestamps, metadata          |
| Label         | `text-xs font-medium uppercase tracking-wide text-muted-foreground` | Section labels                |
| Mono          | `font-mono text-xs`                                                 | Keyboard shortcuts, IDs, code |

## Spacing

| Token   | Value | Usage                           |
| ------- | ----- | ------------------------------- |
| `gap-1` | 4px   | Between icon and text in badges |
| `gap-2` | 8px   | Default gap between items       |
| `gap-3` | 12px  | Between cards in a list         |
| `gap-4` | 16px  | Between major sections          |
| `gap-6` | 24px  | Page-level top margin           |

## Border Radius

| Token          | Value            | Usage                  |
| -------------- | ---------------- | ---------------------- |
| `--radius`     | `0.375rem` (6px) | Global default         |
| `rounded-sm`   | 3px              | Small inline elements  |
| `rounded-md`   | 6px              | Cards, inputs, buttons |
| `rounded-lg`   | 8px              | Dialogs, sheets        |
| `rounded-full` | 50%              | Avatars only           |

## Component Specs

### Card

- `rounded-md border bg-card text-card-foreground` (no shadow in dark)
- Header: `p-3 flex flex-col gap-1`
- Content: `p-3 pt-0`
- Footer: `p-3 pt-0 flex items-center`

### Button sizes

| Size      | Height    | Padding  | Font      |
| --------- | --------- | -------- | --------- |
| `sm`      | `h-7`     | `px-2.5` | `text-xs` |
| `default` | `h-8`     | `px-3`   | `text-sm` |
| `lg`      | `h-9`     | `px-4`   | `text-sm` |
| `icon`    | `h-8 w-8` | —        | —         |

### Badge

- `inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium`

### Input / Textarea

- Height: `h-8`, Padding: `px-3 py-1.5`, Font: `text-base md:text-sm`
- Note: `text-base` (16px) on mobile prevents iOS from auto-zooming on focus; `md:text-sm` restores compact density on larger screens.

### Checkbox row

Card-style toggle rows (bordered box + label + optional description):

- Wrapper: `flex items-start gap-3 rounded-md border p-4 cursor-pointer hover:bg-accent/50`
- Checkbox offset: `mt-0.5` (aligns with title baseline, not top edge)
- Title: `text-sm font-medium leading-none`
- Description: `text-sm font-normal text-muted-foreground`
- The entire row must be clickable — use `CheckboxCard` from `@/components/ui/checkbox-card`, which wraps everything in a `<Label htmlFor>` element.
- See [docs/requirements/navigation/COMPONENTS.md](../docs/requirements/navigation/reference-components-page-layout-primitives.md#checkbox--radio-rows).

## Button groups

Use `ButtonGroup` (`web/components/ui/button-group.tsx`) as the layout primitive for grouped
actions. Items inside a `ButtonGroup` must always be `<Button>` elements sharing one variant
and size — never ghost text links, anchors, or mixed variants.

- Default orientation is horizontal (`flex-row flex-wrap gap-2 items-center`).
- Use `orientation='vertical'` for stacked action lists (full-width `flex-col items-stretch gap-2`).
- Use `size='touchSm'` (44 px mobile, compact desktop) when the group is mobile-visible.

## What NOT to Do

- No gradients in the app shell
- No `rounded-xl` or `rounded-2xl` on functional elements
- No `p-6` or `p-8` inside components
- No `text-3xl` or larger inside the app shell
- No `shadow-md` on cards in dark mode
- No raw gray — all neutrals have the 230 hue (blue-space tint)
