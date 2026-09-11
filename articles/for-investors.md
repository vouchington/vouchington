---
title: 'Voucha for Investors: Platform Metrics and Growth Intelligence'
slug: for-investors
post_type: article
topics:
  - voucha
---

# Voucha for Investors: Platform Metrics and Growth Intelligence

Voucha is a social trust network — reviews, recommendations, and community knowledge filtered through the people you actually trust. Investors with the `investor` role have direct access to the growth dashboard at `/growth`. This document covers what the dashboard tracks, how to read the metrics, and what the underlying business dynamics look like.

## Dashboard Access

The growth dashboard is accessible to `administrator` and `investor` roles at `/growth`. It is not publicly accessible.

Date range filters let you slice all metrics by: **Today**, **Last 7 days**, **Last 30 days** (default), **Last 90 days**, or **All time**. The URL updates as you change the range, making specific views bookmarkable and shareable.

## Six KPI Categories

### User Growth

| Metric                     | What It Measures                                   |
| -------------------------- | -------------------------------------------------- |
| Total users                | All non-deleted accounts                           |
| New signups                | Accounts created in the selected period            |
| DAU                        | Distinct users who contributed content in last 24h |
| MAU                        | Distinct users who contributed content in last 30d |
| DAU/MAU ratio              | Engagement health (target: > 20%)                  |
| Onboarding completion rate | % of new users who completed the onboarding flow   |

DAU/MAU below 20% is a retention signal worth investigating. Onboarding completion rate below 60% points to friction in the sign-up flow.

### Content Production

Tracks posts by type (reviews, data points, discussions, comments, story posts), contributions per active user, and clearance approval rates. High data-point volume in a category signals genuine community depth — not just discussion, but structured intelligence accumulation.

### Engagement

Vote counts, comment counts, follow actions, and bookmark rates. The ratio of upvotes to total posts measures community consensus quality. Increasing follow rates per new user indicates the social graph is forming — a leading indicator of retention.

### Network Effects

Referral coefficient (new users acquired per existing user), topic coverage (topics with at least one data point or review), and cross-vertical engagement (users active in more than one vertical). Multi-vertical users have significantly higher retention because they've integrated Voucha into multiple decision contexts, not just one.

### Revenue

MRR, churn rate, plan distribution (free / Plus / Pro), and upgrade/downgrade rates. The key health metric here is churn against monthly ARPU: low churn with Plus/Pro concentration indicates the contribution gating and vote weight differentiation are working as retention drivers.

### Infrastructure

Crawler success rates, queue throughput, cache hit rates, and embedding pipeline latency. Infrastructure metrics are capped at 90 days even for "all time" views to avoid unbounded time-series scans.

## The Growth Thesis

Voucha's competitive position rests on three dynamics that compound together:

**Data network effect.** Every structured data point contributed makes aggregate statistics more precise. A credit card approval rate based on 50 data points is directionally useful. Based on 5,000, it's institutionally reliable. The data becomes more valuable as the community grows — and more valuable data attracts more contributors.

**Trust network effect.** The social graph shapes who sees whose content. As more users establish trust relationships, the quality of personalized recommendations improves. This is a second-order network effect on top of the data network effect: not just more data, but better-contextualized data.

**Multi-vertical expansion.** The infrastructure is vertical-agnostic. The same trust graph, data point schema, and AI chat system that powers credit card intelligence powers hardware, AI tools, cars, appliances, and any other category where people make consequential decisions. Expansion into a new vertical leverages existing user trust relationships and doesn't require rebuilding the trust system from scratch.

The anti-bot design — 7-day posting and review gating for free accounts, trust-weighted suppression for new votes — is not just a product feature. It's a long-term data quality moat. Data from a platform with robust bot resistance compounds in quality over time relative to platforms without it.

## What to Watch

The leading indicators of breakout growth in a new vertical are: (1) data point volume exceeding 100 per month in that category, (2) referral link traffic from Voucha community members showing real conversion data, and (3) at least one trusted community forming around that vertical's topics. These three together indicate genuine community depth rather than tourism.

The metrics dashboard surfaces all of these at the category level within the Content Production section.
