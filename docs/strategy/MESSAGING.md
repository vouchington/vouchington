# Voucha Messaging Constitution

This document is the source-of-truth for Voucha's brand positioning, voice, and copy. Every user-facing rework — homepage, articles, emails, microcopy — is measured against it.

Related issue: [#6232 "Constitution"](https://github.com/jonathanong/filaments/issues/6232)

---

## Positioning

**Voucha is a social trust network.**

Follow the people and sources you actually trust, and get news, reviews, and recommendations filtered through your circle — instead of anonymous strangers, paid rankings, and AI slop.

The name is the thesis: people **vouch** for things, with their reputation attached.

### Category line / hero headline

> The Social Trust Network.

This is the brand statement itself — what Voucha is, said once, with authority.

### Hero subhead

> Follow the people and sources you actually trust. Voucha brings you their news, reviews, and recommendations — and keeps out the fake reviews, paid placements, and AI slop.

### Site description (meta / SITE_DESCRIPTION)

> Voucha is a social trust network — news, reviews, and recommendations from the people and sources you actually trust.

---

## The Thesis

**Problem:** The internet broke trust. Reviews are faked, rankings are bought, "best of" lists are affiliate placements — and now AI just launders all of it back at you with confidence.

**Answer:** Voucha rebuilds trust the way humans actually do it — through people. You build a circle of trusted people and sources. Their vouches count more; strangers' count less. Everything you see is filtered through that circle.

---

## Voice & Tone

1. **Talk like a person, not a platform.** Second person ("you," "your friends"), short sentences, plain words.
2. **Lead with the human benefit, then the mechanism.** "See what your friends actually recommend" _before_ "trust-weighted voting."
3. **Concrete over abstract.** Name real things — a credit card, a GPU, a podcast — not "high-consideration purchase decisions."
4. **Confident and a little contrarian, never hypey.** Take a side against fake reviews and dead-internet slop; avoid "revolutionary AI-powered."
5. **AI is a feature, not the brand.** AI appears only when it adds to the trust story — never as the lead identity. The homepage AI tile ("An AI that only trusts your sources") is the model: AI as a capability that follows from your circle, not a standalone selling point.

---

## Lexicon

| Retire (in marketing prose)                                 | Prefer                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| "consumer intelligence platform," "multi-vertical platform" | "social trust network," "Voucha"                         |
| "structured data points" (as a hero phrase)                 | "real numbers," "real data from people who used it"      |
| "trust signals permeate every surface," "aggregation"       | "people you trust count more," "see the pattern"         |
| "high-consideration purchase decision"                      | "big decisions," "what to buy"                           |
| Leading with "AI" / "LLM" / "RAG"                           | Lead with people/trust; name AI only when it's the topic |

---

## The Pillars (intent × outcome)

These are the five things Voucha does, framed as what you get — not how the product works.

| #   | Pillar                          | Outcome heading                                       | Supporting line                                                                                                                      |
| --- | ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Community-curated sources       | "Your feed, curated by people — not an algorithm."    | "Follow news sites, podcasts, and YouTube channels through friends. Review, follow, and share the sources worth your time."          |
| 2   | Review anything                 | "Honest reviews of anything — from people you trust." | "Credit cards, GPUs, AI tools, cars — real reviews and real numbers from people who used them, not affiliates chasing a commission." |
| 3   | Referral links                  | "Referral links from friends, not strangers."         | "When you recommend something, your friends get _your_ link. Share referral links inside your circle of trust."                      |
| 4   | Communities                     | "Build your own vouched community."                   | "Start a space around what you care about, with trust and moderation built in from day one."                                         |
| 5   | Personalized AI _(coming soon)_ | "An AI that only trusts your sources."                | "We're building an AI that answers only from the websites and people you trust — not the whole gamed internet."                      |

### Push / hold map

| Theme                                    | Status                 | Treatment                                                                                  |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| Trust / reputation system                | **Spine** (not a tile) | Connective tissue; explain on How It Works as the mechanism behind everything.             |
| Data points (approval rates, benchmarks) | Push — as proof        | Fold under "Review Anything" as the proof layer ("real numbers"), not a standalone pillar. |
| Stories (follow events over time)        | Push — soft            | Sub-feature under Curated Sources: "Follow the story, not the headline."                   |
| Domain trust / most-trusted domains      | Push — as proof        | Live social proof on homepage; mechanism, not a lead tile.                                 |
| Influencer hub                           | Push                   | Sub-use-case of Referral Links (pillar 3).                                                 |
| Developer platform / API                 | **HOLD**               | Keep articles; don't surface as a homepage/nav pillar yet.                                 |
| Investor metrics                         | **Internal**           | Keep article; never a public pillar.                                                       |
| Memberships / paid plans                 | Supporting             | Surface only on `/plans`, not as a homepage pillar.                                        |
| Advanced moderation / anti-bot internals | **HOLD**               | Keep explainer articles; don't lead marketing with anti-bot mechanics.                     |

---

## Guardrails

This is a user-facing prose rework only. These must not change:

- **DB/API field names, feature identifiers, enums** — UI label renames don't propagate to data model. "Data Points," "elections/votes," etc. stay as features.
- **Article frontmatter `slug`** — slugs are upsert dedup keys; changing one creates a duplicate post. Rewrite `title` and body; keep `slug`, `post_type`, `topics`.
- **`data-pw` test IDs** — copy changes inside elements are fine; do not rename/remove `data-pw` attributes.
- **Routes and `href`s** — navigation labels may change; underlying URLs do not (except where an existing URL is stale and the new target is an already-existing route).

## Related

- [Product strategy](product-strategy.md) — the strategic definition this positioning is derived from
- [Go-to-market strategy](go-to-market.md) — per-segment application of this voice (`## Segment-Specific Messaging`)
