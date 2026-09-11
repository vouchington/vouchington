# Product Strategy

## What Is Voucha?

Voucha is a multi-vertical consumer intelligence platform built on human trust signals. It is not a credit card forum, a hardware review site, or an AI tool directory — it is a platform where structured crowd-sourced data creates layered trust across any product domain.

Every piece of content on Voucha carries structured data that can be aggregated, compared, and filtered by trust. Users contribute real-world data points (credit card approvals, hardware failure rates, AI tool usage patterns) that become more valuable as the community grows.

## Core Insight

Every high-consideration purchase decision boils down to: **"Who do I trust, and what did they experience?"**

Existing solutions fail this test:

- **Reddit** — Unstructured data buried in threads. No way to aggregate or compare.
- **Review sites** — Ad-driven incentives corrupt editorial judgment. Affiliate commissions determine ranking.
- **Amazon reviews** — Systemically gamed. No structured data beyond star ratings.
- **Credit card forums** — Fragmented, hard to search, no aggregation of approval data.

Voucha solves this by combining structured data collection, social trust graphs, and community-driven quality signals into a single platform.

## Key Differentiators

| #   | Differentiator                             | Description                                                                                                                                       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Structured data points**                 | Every contribution includes typed, queryable fields — not just free text. Approval rates, failure rates, switch patterns become first-class data. |
| 2   | **Trust on everything**                    | Votes, follows, and behavioral signals create trust scores that permeate every surface: content ranking, data aggregation, search results.        |
| 3   | **Social graph prioritization**            | A friend's referral link ranks above a stranger's. A trusted contributor's review weighs more than an unknown account's.                          |
| 4   | **Multi-vertical by design**               | The data point schema is extensible per category. Credit cards, hardware, AI tools, and future verticals share the same trust infrastructure.     |
| 5   | **Landing pages as distribution**          | Every user gets a shareable @username page that turns them into a distribution channel. The product grows through its users.                      |
| 6   | **Product families / variants / listings** | Canonical product hierarchy (family → variant → listing) enables cross-retailer comparison and per-listing affiliate tracking.                    |
| 7   | **Trust-scored RSS & domain authority**    | News sources carry community trust scores. Domain voting surfaces reliable sources and suppresses low-quality ones.                               |
| 8   | **Trust-filtered AI chat**                 | Conversational AI grounded in community-verified data, filtered by trust signals rather than raw volume.                                          |
| 9   | **Calibrated multi-topic reviews**         | Reviews include confidence levels, duration of use, "compared to" links, and sub-ratings that enable apples-to-apples comparison.                 |

## A-Ha Moments by Vertical

### Credit Cards

A user searches for a specific card and sees: "73% approval rate for 750+ credit scores" alongside their friend's referral link and a data point showing the friend was approved with a similar profile. The combination of aggregate data and personal trust makes the decision obvious.

### Hardware

A user researching a GPU sees: "12% failure rate reported after 18 months" with a breakdown by manufacturer variant. Real-world longevity data that no review site tracks.

### AI Tools

A user evaluating AI coding assistants sees: "40% of users switched from Tool A to Tool B within 6 months" with structured reasons. Actual adoption patterns, not marketing claims.

## Content Policy

Voucha focuses exclusively on **purchase and ownership decisions**. The platform exists to help people make better choices about products and services.

### Banned Content

| Category                   | Rationale                                                   |
| -------------------------- | ----------------------------------------------------------- |
| Political content          | Destroys trust signal quality; invites brigading            |
| NSFW content               | Incompatible with advertiser relationships and brand safety |
| Hate speech & harassment   | Zero tolerance; immediate suspension                        |
| Fraud & fake data          | Fabricated data points undermine the core value proposition |
| Buying / selling / trading | Voucha is not a marketplace                                 |
| Spam & self-promotion      | Enforced through trust signals and rate limiting            |
| Illegal content            | Standard compliance requirement                             |
| Market manipulation        | Coordinated campaigns to inflate/deflate product ratings    |
| Off-topic content          | Content unrelated to product/service purchase decisions     |

## Trust System Phases

| Phase       | Timing      | Mechanism                                                                                                                            |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1** | Launch      | Implicit trust via votes. All votes weighted equally. Social graph follows establish baseline relationships.                         |
| **Phase 2** | Post-launch | Vote weight calibration. Users whose votes align with moderator assessments earn higher weight. No explicit trust scores shown.      |
| **Phase 3** | Scale       | ML-based trust. Multi-factor signals: vote accuracy, data point verification rate, review quality metrics, cross-domain consistency. |

See [Trust System](../requirements/trust-safety/trust-system.md) for full specification.

## Branding

**Voucha** — "Vouch for It." The name captures the platform's core mechanic: real people vouching for products, services, and recommendations with structured data and their personal reputation. A vouch carries weight because it's tied to identity, experience, and accountability.

**Brand themes:**

- **Personal endorsement** — "I vouch for this" means you've used it, experienced it, and stand behind it
- **Social trust** — Your network's vouches matter more than a stranger's. Trust flows through relationships.
- **Verified experience** — Vouching requires real ownership and usage data, not opinions from the sidelines
- **Accountability** — Vouches are public, tied to reputation, and ranked by the community

**Company**: Voucha, Inc.

**Tagline options:**

- "Trust on everything"
- "Real data from real people"
- "Vouch with data"

## Feedback Loops

24 feedback loops span growth, engagement, trust, monetization, and defense. The primary growth insight: Voucha tracks attribution and trust in the database, and the data exists to compute contribution impact, but surfaces almost none of it to users. Closing these feedback gaps — new follower notifications, contribution impact signals, landing page analytics, referral signup notifications — is the highest-leverage growth investment because the data infrastructure already exists.

See [Feedback Loops](feedback-loops.md) for the full inventory and growth roadmap.

## Failure Modes

Ranked by likelihood and impact:

| #   | Failure Mode                   | Risk                                                                                 | Mitigation                                                                                              |
| --- | ------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1   | **Data quality death spiral**  | Low data volume → unreliable aggregates → users lose trust → fewer contributions     | Seed aggressively pre-launch; display confidence intervals; require minimum N before showing aggregates |
| 2   | **Solo founder burnout**       | Single point of failure for development, moderation, and community management        | Automate moderation (AI pipeline); prioritize features that reduce manual intervention                  |
| 3   | **Spam / trust contamination** | Bot accounts flood low-quality data points; gaming referral links                    | Trust system is inherently anti-bot; contribution gating; behavioral analysis                           |
| 4   | **Political content creep**    | Users push boundaries on "product" definitions to include politically charged topics | Hard content policy; automated detection; no exceptions                                                 |
| 5   | **Affiliate program bans**     | Platform depends on affiliate revenue; programs may change terms or ban the domain   | Diversify revenue (memberships, display ads, API access); maintain compliance                           |
| 6   | **Legal / compliance**         | User-generated data creates liability; GDPR, CCPA, defamation concerns               | Data point anonymization options; clear ToS; deletion/export APIs                                       |

## Related

- [Feedback loops](feedback-loops.md) — growth, engagement, trust, and monetization feedback loops
- [Trust system](../requirements/trust-safety/trust-system.md) — trust and reputation phases
- [Messaging constitution](MESSAGING.md) — how this positioning translates into brand voice and copy
- [Backend rules](../../backend/CLAUDE.md) — service and data conventions
- [Web rules](../../web/CLAUDE.md) — product-surface UI conventions
