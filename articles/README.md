# Articles

Seed articles for blog publishing and RAG ingestion. These serve dual purpose: published as blog posts at launch, and ingested into the AI chat agent's knowledge base.

## Existing

- [Voucha Bot](voucha-bot.md) — Bot detection and handling
- [News Source Eligibility](news-source-eligibility.md) — News source criteria
- [How Moderation Works](how-moderation-works.md) — Clearance pipeline, LLM agents, user reports, and role tiers
- [Community Moderation Tools](community-moderation-tools.md) — Community owner/moderator tools and workflows
- [What Happens When Content Is Removed](what-happens-when-content-is-removed.md) — End-user removal, warnings, bans, and contact paths

## Credit Cards

- [What Is Credit Card Churning?](what-is-churning.md) — Beginner's guide to churning
- [The Chase 5/24 Rule](chase-5-24-rule-explained.md) — Everything you need to know
- [How to Pick Your First Rewards Credit Card](best-first-credit-card.md) — First card decision framework
- [How to Read Credit Card Data Points](credit-card-data-points-guide.md) — Why data points matter
- [Credit Card Referral Links](credit-card-referral-links-explained.md) — How they work and who benefits
- [Spending Category Optimization](how-to-optimize-credit-card-spending.md) — Getting 5x on everything
- [The Household Card Strategy](household-credit-card-strategy.md) — Coordinating cards across family
- [Amex vs Chase Ecosystem](amex-vs-chase-ecosystem.md) — Which rewards platform to commit to
- [Credit Score Myths Debunked](credit-score-myths-debunked.md) — What community data shows
- [When Is an Annual Fee Worth It?](annual-fee-worth-it.md) — Data-driven analysis

## Computer Hardware

- [How to Build a Workstation in 2026](how-to-build-workstation-2026.md) — Beyond gaming PCs
- [GPU Real-World Benchmarks](gpu-real-world-benchmarks.md) — What manufacturer specs don't tell you
- [Crowd-Sourced Hardware Reliability](hardware-reliability-crowd-sourced.md) — Why community data beats reviews
- [Building an AI/ML Workstation](ai-workstation-build-guide.md) — Community-recommended components
- [Buying Used Hardware](used-hardware-buying-guide.md) — Trust signals and what to look for
- [Monitor Buying Guide](monitor-buying-guide-community.md) — Real user experiences over marketing specs

## AI Tools

- [AI Coding Assistants Compared](ai-coding-assistants-compared.md) — What developers actually use
- [ChatGPT vs Claude vs Gemini](chatgpt-vs-claude-vs-gemini.md) — Community verdict
- [AI Image Generation Tools Ranked](ai-image-generation-tools-ranked.md) — Ranked by real users
- [AI Tools for Small Business](ai-tools-for-small-business.md) — Community recommendations
- [Why People Switch AI Tools](switching-ai-tools.md) — Patterns from community data
- [AI Subscription Fatigue](ai-subscription-fatigue.md) — Which tools are worth paying for

## Trust, RSS, and Domain Authority

- [The Dead Internet Trust Problem](dead-internet-trust-problem.md) — How to know what's real
- [Domain Authority, Voted by Humans](domain-authority-community-voted.md) — Why Voucha scores websites
- [RSS Feeds Are Making a Comeback](rss-feeds-comeback.md) — Why that matters
- [Why Editorial Reviews Can't Be Trusted](why-editorial-reviews-cant-be-trusted.md) — And what to use instead
- [Social-Graph Feed Curation](social-graph-feed-curation.md) — What your trusted friends are reading
- [Trust Signals on Voucha](trust-signals-explained.md) — Domains, feeds, users, and content
- [AI That Only Answers from Sources You Trust](ai-chat-trust-filtered.md) — Trust-filtered AI
- [Why ChatGPT Gives Bad Credit Card Advice](why-chatgpt-gives-bad-advice.md) — And how trust-filtered AI fixes it

## Platform and Cross-Vertical

- [Why Voucha](why-voucha.md) — Real data from real people
- [Getting Started with Voucha](how-to-use-voucha.md) — Your first 5 minutes
- [How Community Trust Works](community-trust-how-it-works.md) — Deep dive on the trust system
- [Create Your Referral Landing Page](landing-page-guide.md) — In 60 seconds
- [What Are Data Points?](data-points-explained.md) — Why you should submit yours
- [Voucha vs Reddit](voucha-vs-reddit.md) — Structured intelligence vs unstructured discussion
- [Why You Can Trust Reviews on Voucha](reviews-you-can-trust.md) — The review trust crisis, solved
- [Voucha Communities Explained](communities-explained.md) — How communities work for members
- [How Voucha Chat Works](voucha-chat-explained.md) — AI grounded in community intelligence
- [How Voucha Stories Work](stories-explained.md) — Following news events, not just headlines
- [Voucha's Product Catalog](product-catalog-guide.md) — How product comparisons work

## Future Vertical Teasers

- [Buying a Car with Data](car-buying-data-driven.md) — What real owners report
- [EV Real-World Range](ev-real-world-range.md) — What manufacturers won't tell you
- [How Long Does Your Appliance Last?](home-appliance-lifespan.md) — Crowd-sourced lifespan data
- [Why G2 and Capterra Reviews Can't Be Trusted](saas-reviews-you-can-trust.md) — And what to use instead
- [Loyalty Program Optimization](travel-loyalty-optimization.md) — A data-driven approach

## For Specific Audiences

- [Voucha for Churners](for-churners.md) — Structured data points, real approval odds
- [Voucha for Hardware Enthusiasts](for-hardware-enthusiasts.md) — Community-backed benchmarks and reliability
- [Voucha for AI Practitioners](for-ai-practitioners.md) — Tool reviews from people who build
- [Voucha for Influencers](for-influencers.md) — Your referral link hub
- [Voucha for Families](for-families.md) — Optimize your household's cards, tech, and more
- [Voucha for Developers](for-developers.md) — Open standards, API access, structured data
- [Voucha for Community Creators](for-community-creators.md) — Build topic-focused spaces with real trust
- [Voucha for Investors](for-investors.md) — Platform metrics and growth intelligence
- [Voucha API Keys Guide](api-keys-guide.md) — Programmatic access to community data

## Legal & Institutional

- [About Voucha](about.md) — Company and platform overview
- [Terms of Service](terms-of-service.md) — Platform terms of service
- [Privacy Policy](privacy-policy.md) — Data handling and user rights
- [Community Guidelines](community-guidelines.md) — User-generated content and community rules
- [Cookie Policy](cookie-policy.md) — What cookies Voucha uses and how to control them

## Frontmatter Format

Articles use YAML frontmatter to declare metadata:

```yaml
---
title: 'Article Title'
slug: article-slug
post_type: article
topics:
  - topic-slug
---
```

- `title`: The article's display title.
- `slug`: URL-safe identifier used to construct the post URL and for upsert deduplication.
- `post_type`: Must be `article` for articles or `blog_post` for blog posts.
- `topics`: List of topic slugs to tag the article with on upsert.

## Seeding

This directory is the committed source of truth for article Markdown. On trusted `main`, `.github/workflows/sync-articles.yml` packages the regular article Markdown files, excluding this source-only `README.md`, into one attempt-qualified Actions artifact. The private infrastructure receiver selects and validates that exact artifact, and owns destination mapping and publication.

Articles are upserted to the database via [`backend/scripts/seed/articles.mts`](../backend/scripts/seed/articles.mts), which runs as part of the local/test seed process and reads this committed directory directly. The admin article sync uses [`@services/articles`](../backend/services/articles/README.md) to read the S3 objects, parse frontmatter, and create or update posts by slug.
