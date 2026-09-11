# Memberships reference

[Back to Memberships](memberships.md)

[Canonical plan and entitlement contract](reference-memberships-plans.md)

## Feature Limits

Ownership and creation limits vary by membership tier:

### Negative-count visibility

All signed-in users can cast negative semantic choices. Negative **count** visibility is restricted by membership tier for **posts only**. Non-UGC content (topics, hostnames, RSS feed items, entity relations) shows negative counts to all users regardless of membership:

| Tier       | View counts | Cast negative choice   | See negative counts       |
| ---------- | ----------- | ---------------------- | ------------------------- |
| Signed-out | Yes         | No (not authenticated) | No                        |
| Free       | Yes         | Yes                    | No (`votes_count_down=0`) |
| Plus / Pro | Yes         | Yes                    | Yes                       |
| Admin      | Yes         | Yes                    | Yes                       |

- **No API enforcement on negative choices**: the handler accepts every choice permitted by that election's semantic policy from all signed-in users regardless of membership tier.
- **Response sanitization**: Election responses set `votes_count_down = 0` for non-paid users, hiding negative-count data without restricting the ability to vote. `votes_score_net` remains API-visible; the UI does not render it. The `can_downvote` boolean indicates visibility, not permission to cast a negative choice.
- **Frontend**: `ScoreVote` presents every permitted semantic choice to signed-in users.

### Community Ownership

**Community ownership is free** for any user with a username. There is no membership-tier cap on how many communities a user can own, though community creation remains subject to the anti-abuse contribution limits. Community posts and curated lists are available by default.

### Agent Prompt Slots

Community agent prompt slots remain the paid community feature. Membership lapse behavior for agent prompt slots is documented with the community agent prompt service.

### Autotagger

The [autotagger agent](../../../backend/agents/autotagger/README.md) tags new posts with related topics automatically. How many topics it may add is gated by the **post author's** membership tier, resolved at worker time — free authors get zero automatic tags (no LLM call is made at all):

| Plan  | Autotagger Topics (per post) |
| ----- | ---------------------------- |
| Free  | 0 (no LLM call)              |
| Plus  | 5                            |
| Pro   | 10                           |
| Admin | 10 (treated as pro-level)    |

**Admin authors are treated as pro-level, not unlimited.** `getUserActivePlan` has no concept of an administrator plan, so `resolvePostAutotaggerMaxTopics` (`backend/workers/ai-agents/processors/process-autotagger.mts`) checks the author's `administrator` role directly and maps it to the pro cap — this is a deliberate choice, not an oversight, since leaving admin-authored posts on the free default would silently disable autotagging for staff posts.

These defaults are runtime-tunable via the `autotagger-paid-limits` DynamicConfig namespace (`post_free_max_topics`, `post_plus_max_topics`, `post_pro_max_topics`), the same mechanism used for [contribution rate limits](../trust-safety/CONTRIBUTION-LIMITS.md). RSS feed item topic enrichment is tiered by **follower** plan instead of author plan; see the autotagger README for that flow. Its private Plus/Pro collaborative caps are runtime-tunable but validated as Plus ≤ Pro.

### RSS follower entitlements (internal)

RSS crawl scheduling weights each unique follower of a canonical feed as Free = 1, Plus = 2, or Pro = 3. A paid entitlement must otherwise be active or past due and not deleted/cancelled/expired/paused. Expiry is source-specific: direct provider sources follow the provider-authoritative terminal lifecycle, so a stale `expires_at` or billing-period end alone does not revoke access; time-bounded administrator grants and family entitlements require `expires_at` to be absent or later than the current time. `view_current_paid_memberships` applies that lifecycle once, selecting Pro over Plus if duplicate current rows ever exist; both the crawl materialized view and collaborative topic-enrichment pools use it. The crawl materialized view applies these changes on its nightly refresh. Plus and Pro remain qualitatively Enhanced and Most in public product copy, while these caps and crawl weights remain internal implementation details. Public RSS copy may promise only relative influence from following a feed, never a guaranteed crawl cadence or SLA.

This is separate from the [manual tag-add limit](../content/TAGS.md#manual-tag-add-limit), which caps how many tags a user can manually attach and is unrelated to autotagger topic counts.
