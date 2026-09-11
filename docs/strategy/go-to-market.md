# Go-to-Market Strategy

## Phase 0 — Pre-Launch (2 Weeks)

Seed content and infrastructure before any public launch.

### Content Seeding

| Content Type           | Target | Purpose                                         |
| ---------------------- | ------ | ----------------------------------------------- |
| RSS feeds              | 50+    | Populate news/discussion feeds across verticals |
| Credit card reviews    | 30+    | Establish the primary vertical with real data   |
| Hardware reviews       | 20+    | Demonstrate multi-vertical capability           |
| AI tool reviews        | 10+    | Show the extensible data model                  |
| Structured data points | 50+    | Populate aggregate views with meaningful data   |

### Infrastructure

- Create @jong landing page as proof of concept
- Recruit 5-10 founding members from personal network
- Verify affiliate integrations are live and tracking
- Ensure all aggregate views show confidence intervals and sample sizes
- Test referral link flow end-to-end (share → click → attribution)

## Phase 1 — Soft Launch (Month 1-2)

**Target**: 100 users, first paying customer.

### Channels

| Channel                        | Approach                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Landing page everywhere**    | @jong link in all social bios, email signatures, forum profiles                                                                                                             |
| **Reddit — personal outreach** | Authentic participation in r/churning, r/creditcards, r/CreditCardBenefits. Share personal data points with links back to Voucha. No spamming — value-first contributions.  |
| **Hacker News**                | Two-angle launch: (1) Technical post on the architecture (Rust + Node.js, trust-weighted data, structured data points) (2) Product post on the consumer intelligence thesis |
| **Twitter/X**                  | Data-driven content: "I analyzed 200 credit card approval data points — here's what I found." Thread format with link to full data on Voucha.                               |
| **Hardware subreddits**        | r/hardware, r/buildapc, r/nvidia, r/amd — share real-world failure rate data and longevity reports                                                                          |

### Success Metrics

- 100 registered users
- 200+ data points submitted by non-founder accounts
- At least 1 paying Plus member
- 10+ users with active landing pages

## Phase 2 — Growth (Month 3-6)

**Target**: 500 users, 2,000+ data points, 20 paying members.

### Strategies

| Strategy                    | Details                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Landing page viral loop** | Users share pages → new visitors → new users → new pages. Track loop conversion at each step.                                                                    |
| **Vertical-specific SEO**   | Target long-tail queries: "Chase Sapphire Preferred approval odds 750 credit score", "RTX 5090 failure rate", "Cursor vs Copilot real users"                     |
| **Content partnerships**    | Partner with YouTube reviewers and bloggers to embed Voucha data in their content. Offer API access for data widgets.                                            |
| **Weekly newsletter**       | Curated data insights: "This week in credit card approvals", "Hardware reliability report". Drives return visits and establishes authority.                      |
| **Influencer recruitment**  | Target credit card influencers, tech reviewers, and AI practitioners. Offer early Plus membership and featured landing pages.                                    |
| **Close feedback gaps**     | Surface landing page analytics, new follower notifications, referral signup notifications, contribution impact signals. See [Feedback Loops](feedback-loops.md). |

### Success Metrics

- 500 registered users
- 2,000+ structured data points
- 20 paying Plus members
- Organic search traffic growing month-over-month
- Newsletter subscriber list at 200+

## Phase 3 — Monetization (Month 6-12)

**Target**: Sustainable revenue from multiple streams.

### Revenue Strategy

| Stream                      | Approach                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gated data analytics**    | Aggregate data views, trend charts, and comparative analytics behind Plus membership. Free users see basic counts; paid users see full breakdowns. |
| **Referral revenue growth** | Expand affiliate partnerships. Trust-ranked referral links drive higher conversion than random link aggregators.                                   |
| **Rev-share consideration** | Evaluate revenue sharing with top contributors whose referral links generate significant affiliate income. Aligns incentives.                      |
| **Enterprise / API tier**   | Offer structured data access via API for fintech apps, review aggregators, and product comparison tools.                                           |
| **Display ads**             | Trust-aligned ad networks (see Display Ad Strategy below). Secondary revenue stream.                                                               |

## Segment-Specific Messaging

Per-segment application of the brand voice defined in the [Messaging Constitution](MESSAGING.md).

| Segment                    | Hook                                        | Value Prop                                                                                                | CTA                                              |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Credit card optimizers** | "See real approval odds before you apply"   | Structured approval data with credit score ranges, income brackets, and community verification            | "Submit your data point and see how you compare" |
| **Hardware enthusiasts**   | "Real failure rates from real owners"       | Longevity data, real-world benchmarks, and manufacturer variant comparisons that review sites don't track | "Report your experience and help others decide"  |
| **AI practitioners**       | "See what tools people actually switch to"  | Usage duration, switch patterns, and use-case-specific ratings from working professionals                 | "Share your AI tool stack"                       |
| **Influencers**            | "Turn your audience into your distribution" | Landing pages with referral links, click analytics, and social sharing optimization                       | "Create your @username page in 60 seconds"       |
| **Tech builders**          | "Consumer intelligence API"                 | Structured data access, trust-scored aggregations, and real-time data streams                             | "Get API access with Plus"                       |

## Display Ad Strategy

Voucha uses trust-aligned ad networks from day one. No surveillance advertising.

| Option             | Fit        | Notes                                                             |
| ------------------ | ---------- | ----------------------------------------------------------------- |
| **Carbon Ads**     | Excellent  | Developer/tech audience. Non-intrusive. High CPM for the niche.   |
| **EthicalAds**     | Excellent  | Privacy-focused, no tracking. Open source community alignment.    |
| **Google AdSense** | **Banned** | Surveillance-based. Destroys user trust. Incompatible with brand. |

Display ads are a secondary revenue stream — they should never compromise the user experience or editorial independence.

## Bot Mitigation Strategy

Bot defense is a product concern, not just an infrastructure concern. The trust system is the primary defense.

### Layered Defense

| Layer                              | Mechanism                                                                                                                      | Effect                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **Contribution gating**            | Free accounts have a 7-day read-only period before they can submit data points or reviews. Paid accounts get immediate access. | Raises the cost of bot accounts.                          |
| **Trust-weighted contributions**   | New accounts start with minimal trust weight. Contributions from low-trust accounts are suppressed in aggregates and rankings. | Bot data points have near-zero impact on aggregate views. |
| **Behavioral signals**             | Submission velocity, data point consistency, session patterns, referral link click patterns.                                   | Automated detection of non-human behavior.                |
| **Referral link fraud prevention** | Click deduplication, source attribution, velocity limiting per link.                                                           | Prevents bots from inflating referral click counts.       |
| **Data scraping prevention**       | Rate limiting on API and web routes. Aggregate data requires authentication. Raw data export gated behind Plus.                | Raises the cost of wholesale data extraction.             |
| **Community-level defense**        | Domain voting, source trust scores, user reporting. Community identifies and flags suspicious accounts.                        | Crowdsourced detection supplements automated systems.     |

The key insight: **the trust system IS the bot defense**. Bot accounts naturally accumulate low trust weight, which means their contributions are suppressed across every surface. Building robust trust is more effective than playing whack-a-mole with bot detection heuristics.

## Related

- [Backend rules](../../backend/CLAUDE.md) — service and data conventions
- [Web rules](../../web/CLAUDE.md) — UI and routing conventions

- [docs/overview/architecture/ai-agents.md](../overview/architecture/ai-agents.md)
- [docs/overview/architecture/auth-overview.md](../overview/architecture/auth-overview.md)
