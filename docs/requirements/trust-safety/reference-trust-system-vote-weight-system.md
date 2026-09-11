# Trust System reference

[Back to Trust System](trust-system.md)

## Vote Weight System

### Current Architecture

The existing vote weight system (see `backend/services/vote-weight/`) provides the foundation for Phase 2 calibration.

### Planned Enhancements

| Enhancement                 | Phase   | Description                                                          |
| --------------------------- | ------- | -------------------------------------------------------------------- |
| Moderator calibration set   | Phase 2 | Build the reference dataset of moderator-assessed content quality    |
| Accuracy multiplier rollout | Phase 2 | Deploy the `vote_weight = base_weight * accuracy_multiplier` formula |
| Trust-weighted aggregation  | Phase 2 | Apply vote weights to data point aggregation views                   |
| Multi-factor ML model       | Phase 3 | Replace the single accuracy multiplier with a multi-signal model     |
| Cross-domain transfer       | Phase 3 | Enable trust portability across verticals                            |

## Referral Link Ranking and Trust

The referral link ranking system already uses trust signals (social graph prioritization, decay-weighted votes). As the trust system matures, these signals become more powerful:

- **Phase 1**: Links from followed users rank first. All other links ranked by vote score with time decay.
- **Phase 2**: Semantic vote scores are trust-weighted. High-trust users' positive choices on a referral link contribute more to its ranking.
- **Phase 3**: ML trust scores inform a holistic ranking model that considers trust, relevance, recency, and social proximity.

The same trust infrastructure extends to:

- **Content ranking**: Higher-trust users' posts and reviews surface more prominently.
- **Search ranking**: Trust-weighted signals improve search result quality.
- **Feed ranking**: Personalized feeds prioritize content from trusted sources.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
