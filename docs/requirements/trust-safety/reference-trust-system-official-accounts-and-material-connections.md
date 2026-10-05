# Trust System reference

[Back to Trust System](trust-system.md)

## Official Accounts and Material Connections

Voucha-affiliated accounts are operational identities, not independent consumer identities. Official people, including administrators and investors, and all automated system/AI accounts, must not influence community trust scores, rankings, aggregates, or referral-link social proof through public votes, reviews, data points, or personal endorsements.

Reserved people (`@jong`, `@voucha`) have `platform_account_kind='official'`; automated identities have `system`; members and the deleted tombstone have `NULL`. These kinds are mutually exclusive. System accounts cannot hold roles, and agents can belong only to system accounts. Public `account_type` is derived once: a live agent on a system account is `ai_agent` (including paused agents); other system accounts are `system`; reserved people or member accounts holding administrator/investor roles are `official`. Other members have no label. Usernames never determine account type.

Staff or other affiliated people may use separate non-role personal accounts for genuine personal consumer activity, but those accounts must disclose material connections where relevant.

### Official Account Permissions

| Action                                            | Official / System / AI Agent | Type                 |
| ------------------------------------------------- | ---------------------------- | -------------------- |
| Vote on entity relations (tags, categories, FAQs) | ✅ Allowed                   | Structural           |
| Vote on posts / topics / hostnames / feed items   | ❌ Blocked                   | Sentiment            |
| User trust or user-tag votes                      | ❌ Blocked                   | Sentiment / relation |
| Create/edit community reviews or data points      | ❌ Blocked                   | Sentiment            |
| Creator auto-positive choice on own post          | ❌ Suppressed                | Sentiment            |
| Personal referral-link endorsement                | ❌ Blocked                   | Endorsement          |
| Official Voucha referral link (admin-only)        | ✅ Allowed                   | Platform             |
| Admin moderation vote                             | ✅ Allowed                   | Internal tooling     |
| Moderator agent: tag post + move to review queue  | ✅ Allowed                   | Structural           |
| Following / commenting / reporting                | ✅ Not restricted            | Social               |

#### Non-HTTP writer audit

The restriction is enforced only at HTTP and authorization guards (`isPlatformAccount(user)` is `account_type != null`). Service-level writers (`upsertEntityRelation`, `writeEntityRelations`, `handleElectionVotes`, `upsertEntityRelationElectionVotes`, `upsertTopicElectionVotes`) never check `account_type`, so a platform-account writer is blocked only where a guard sits in front of it. Classifier actors hardcode `account_type: 'ai_agent'` in the actor literal. An election-backed relation written through `upsertEntityRelation` or `writeEntityRelations` also casts the creator's +1 vote unless the caller passes `vote: false`. Human and remote actors are out of scope. Paths are under `backend/`. The tables below classify every non-test caller of those writers and of the `upsert*ElectionVotes` functions outside the election and relation service internals, and `backend/tools/` has no other vote writer. A row is a mismatch when current behavior differs from the permissions table above.

**Structural writers that keep working.** These write election-backed structural relations, matching the "Vote on entity relations" row, and the restriction does not apply.

| Writer                                                                                                                        | Actor                        | Writes                                                         | Coverage                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `services/classifiers/topic-relation-actions.mts:96`, `topic-relation-votes.mts:25`                                           | autotagger classifier        | post or feed-item `category` topic relation and the actor vote | `topic-relation-actions.test.mts` (system and `ai_agent` actors)             |
| `services/post-classifier/effects.mts:50`                                                                                     | post classifier (`ai_agent`) | post `category` topic relation and the actor vote              | `services/post-classifier/run-effects.test.mts`                              |
| `services/rss-feed-items/category-relations.mts:84,90,134`, `category-topic-votes.mts:94`, `reconcile-category-votes.mts:103` | rss-feed-categorizer         | feed-item category and hashtag relations and the actor votes   | `categories.relations.test.mts`, `categories.clear-votes.test.mts`           |
| `services/rss-feeds/category-relations.mts:64`                                                                                | rss-feed-categorizer         | feed `category` topic relation                                 | `services/rss-feeds/__tests__/category-relations.test.mts`                   |
| `services/rss-feed-items/collaborative-topic-relations.mts:94`                                                                | collaborative categorizer    | feed-item topic relations with votes                           | `collaborative-topic-relations.test.mts`                                     |
| `services/stories/story-post-create.mts:153`, `refresh-story-post.mts:133`, `story-post-relation-effects.mts:23-24`           | story-teller (`ai_agent`)    | story post `category` relation and the actor vote              | `services/stories/__tests__/story-posts.projection.test.mts`                 |
| `services/stories/story-post-related-url-projection-relations.mts:146`                                                        | story-teller (`ai_agent`)    | story post related-URL relation and the actor vote             | `story-post-related-url-projection-votes.test.mts`                           |
| `services/articles/sync.mts:122,130,148` to `services/posts/tagging.mts:68`                                                   | administrator (`official`)   | article post tag relations                                     | `services/posts/tagging.generated.test.mts`                                  |
| `services/posts/hashtag-votes.mts:163`, `services/posts/hashtags.mts:76,97`                                                   | post creator or editor       | hashtag and category relations and votes                       | `services/posts/__tests__/category-votes-transactional.test.mts`             |
| `services/posts/create/source-url-relation.mts:57`                                                                            | post creator                 | post `related` URL relation and the creator vote               | none for a platform creator                                                  |
| `services/topic-recommendations/approve-topic-recommendation-side-effects.mts:71`                                             | administrator (`official`)   | topic `landing_page` relation and the approver vote            | none for a platform approver                                                 |
| `services/entity-relation-actions/create.mts:77` (REST create and MCP `add_entity_relation`)                                  | any platform account         | structural relation and the creator vote                       | `user-tags-authorization.test.mts` (user-tag branch only)                    |
| `api/v1/entity-relations/entity-relation-votes.mts:54-56`                                                                     | any platform account         | structural relation vote over HTTP (the guard allows it)       | `entity-relations.official-vote.test.mts` (`official`, `system`, `ai_agent`) |

**Not applicable.** No election-backed vote or relation is written.

| Writer                                                                                                                         | Why                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `services/post-mentions/processors.mts:102,112,122`                                                                            | writes `mentioned`, which is not an election-backed predicate                                                                       |
| `services/web-risk/check.mts:154`                                                                                              | hostname block, not a vote                                                                                                          |
| `services/vote-integrity/apply-referral-link-penalty.mts`                                                                      | vote-weight penalty, not a vote                                                                                                     |
| `@automod`, `@ban-evasion`, story-clustering classifier                                                                        | write no relation or vote                                                                                                           |
| `services/moderators/tagging.mts`                                                                                              | no production callers (see M4)                                                                                                      |
| `services/admin-imports/process-topic-row-relations.mts:41`                                                                    | administrator writes `parent`, which is not election-backed                                                                         |
| `services/posts/create/transaction-side-effects.mts:132`                                                                       | data-point `category` relation with `vote: false`; platform data-point creation is blocked at `services/posts/authorization.mts:62` |
| `services/ap-inbox-activities/dispatch-activity.mts:73,103`                                                                    | remote actor `follow`, not election-backed                                                                                          |
| `workers/entity-listeners/processors/users.mts:40`                                                                             | referral auto-follow, not election-backed                                                                                           |
| `services/bookmarks/upsert.mts:98`, `services/user-import-export/{auto-follow-on-approval,import-rss-feeds,import-topics}.mts` | follow and bookmark relations, social and unrestricted                                                                              |

**Where the restriction applies.**

| Guard                                                                               | Blocks                                                                                                   | Coverage                                                                                                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `api/election-vote-handler-guards.mts:14`, called at `election-vote-handler.mts:77` | sentiment votes on every `createVoteHandler` route unless the route opts out (clears are always allowed) | `election-vote-handler.test.mts` (administrator), `election-vote-handler.platform-accounts.test.mts` (`official`, `system`, `ai_agent`) |
| `services/entity-relation-actions/user-tag-authorization.mts:17`                    | user-tag relation add and vote, except for administrators                                                | `user-tags-authorization.test.mts` (`system` and `ai_agent` rejected, administrator allowed)                                            |
| `services/bookmarks/upsert.mts:123`                                                 | a follow casting a vouch                                                                                 | `upsert.follow-vouch.test.mts`                                                                                                          |
| `workers/entity-listeners/processors/posts.mts:51`                                  | creator auto-positive vote on the creator's own post                                                     | none for the platform-creator branch                                                                                                    |
| `services/posts/authorization.mts:62`, `services/posts/update/validation.mts:74`    | review and data-point create and edit                                                                    | `create.review-content-validation.test.mts`, `update.review-content-validation.test.mts`                                                |
| `services/user-referral-program-links/authorization.mts:39,54`                      | personal referral links                                                                                  | `api/v1/referral-links/links.test.mts`                                                                                                  |

**Administrator authority.** The user-tag exemption (`user-tag-authorization.mts:17`) and the administrator moderation vote (`allowOfficialAccounts: true` at `api/v1/agents/agent-moderation.mts:51,68`, and the admin MCP tool `tools/admin/agent-votes.mts:47`) are intentional. The two routes that opt out of the vote guard are the structural relation vote (`shouldAllowOfficialAccount`) and the administrator moderation vote (`allowOfficialAccounts`). Topic-recommendation approval is administrator-only (`approve-topic-recommendation.mts:111`). MCP tools match REST: `add_entity_relation` goes through `createEntityRelationAction`, the same guard as the REST route, and `withdraw_entity_relation_vote` only retracts.

**Mismatches (recorded, not changed).**

| Id  | Path                                                                                                                                                       | Mismatch                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `services/post-classifier/effects.mts:35` to `services/classifiers/topic-vote-actions.mts:68`                                                              | The post classifier (`ai_agent`) casts a global topic election vote. HTTP topic votes and the "Vote on posts / topics" row block this account type. |
| M2  | `POST /api/v1/rss-feeds` and the RSS import (`services/rss-feeds/create-source.mts:59,123,162,178`, `services/user-import-export/import-rss-feeds.mts:83`) | An automatic +1 topic vote and follow is written for the caller with no platform-account check.                                                     |
| M3  | `POST /api/v1/fediverse/instances` (`services/fediverse-instances/create-instance.mts:46,65,73`)                                                           | An automatic +1 topic vote is written for the caller with no platform-account check.                                                                |
| M4  | "Moderator agent: tag post + move to review queue" row above                                                                                               | No production caller: `services/moderators/tagging.mts` helpers are unused exports, and `agent-moderate.mts` writes no relation or vote.            |

Which of these stay allowed is a product decision. #1849 requires structural relation votes and administrator user-tag authority to keep working, and the first table is covered by tests for that.
