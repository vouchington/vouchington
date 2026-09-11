# Trust System reference

[Back to Trust System](trust-system.md)

## Overview

The trust system is Voucha' core differentiator. It determines how content is ranked, how data points are weighted in aggregates, whose referral links surface first, and how bot/spam accounts are suppressed. Trust is built in three phases, each adding sophistication without disrupting the user experience.

## Phase 1 — Launch: Implicit Trust via Votes

At launch, trust is simple and transparent.

### Mechanics

- **Equal vote weight**: Every registered user's vote counts the same. No hidden multipliers.
- **Domain/feed voting**: Users vote on RSS sources and domains, establishing community-level trust signals for content sources.
- **Social graph follows**: Users follow other users, creating a social graph that powers referral link ranking and content discovery.
- **Semantic trust choices**: Sentiment elections use Vouch, Like, Neutral, Dislike, and Disavow; narrower elections use Support/Oppose, Confirm/Dispute, or Accurate/Inaccurate.
- **Official-account exclusion**: Accounts with any Voucha role, agent/system accounts, and reserved system users do not create community trust signals. They cannot write community reviews or data points, cannot cast public semantic trust choices, and are excluded from creator auto-votes and moderator negative choices.

### What Trust Affects in Phase 1

| Surface                | Effect                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| Post ranking           | Vote count determines sort order                                               |
| Referral link ranking  | Social graph (followed users) rank higher; vote-based decay ranking for others |
| RSS source ranking     | Domain vote scores determine source visibility                                 |
| Data point aggregation | All verified contributors weighted equally                                     |

### Limitations

Phase 1 trust is vulnerable to:

- Vote brigading (coordinated up/downvoting)
- Account farming (creating many accounts for vote manipulation)
- Low-quality contributions from users with no track record

These are acceptable at launch scale and addressed in Phase 2.
