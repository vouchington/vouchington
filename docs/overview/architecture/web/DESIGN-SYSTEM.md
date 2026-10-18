# Voucha Design System

Interactive design-system, component, autocomplete, shell, and entity permutations live in
Storybook; open `/storybook/` on the local web app. Only trusted `main` builds are hosted, behind
shared Basic Auth. Pull requests get build and browser validation but no hosted preview, because a
preview would run contributor-controlled JavaScript after a reviewer enters the shared credentials.

## Brand Identity

**Voucha** = trust through transparency. Real people vouching for things they know — reviews, data points, and recommendations grounded in lived experience. The UI should feel credible, legible, and purposeful.

**Design principles:**

- **Trust-first.** The interface earns confidence through clarity and restraint. Nothing flashy; everything intentional.
- **Signal, not noise.** Accents are warm gold — small, intentional, never overwhelming. Gold is reserved for CTA buttons and focus rings. Text links and inline accents stay neutral for readability.
- **Density.** Information is tightly organized. Spacing is compact and consistent. No wasted space.
- **Precision over playfulness.** Clean edges, tight radii, restrained animation. Credibility is conveyed through calm.
- **Connectedness.** Subtle borders and dividers link content nodes — vouches that connect people to knowledge.

Tokens (color, typography, spacing, radius) and component specs live in the Tailwind and CSS theme code and in Storybook.

## What NOT to Do

- No gradients in the app shell
- No `rounded-xl` or `rounded-2xl` on functional elements
- No `p-6` or `p-8` inside components
- No `text-3xl` or larger inside the app shell
- No `shadow-md` on cards in dark mode
- No raw gray — all neutrals have the 230 hue (blue-space tint)
