# Platform-account writer audit

[Back to Official Account Permissions](reference-trust-system-official-accounts-and-material-connections.md#official-account-permissions)

The restriction is enforced at HTTP and authorization guards (`isPlatformAccount(user)` is `account_type != null`) and, for topic and post elections, inside the writers themselves (see [Topic and post election writers](#topic-and-post-election-writers)). The other service-level writers (`upsertEntityRelation`, `writeEntityRelations`, `handleElectionVotes`, `upsertEntityRelationElectionVotes`) never check `account_type`, so a platform-account writer is blocked there only where a guard sits in front of it. Classifier actors hardcode `account_type: 'ai_agent'` in the actor literal. An election-backed relation written through `upsertEntityRelation` or `writeEntityRelations` also casts the creator's +1 vote unless the caller passes `vote: false`.

Human and remote actors are out of scope. Paths are under `backend/`. This page classifies every non-test caller of those writers and of the `upsert*ElectionVotes` functions outside the election and relation service internals, and `backend/mcp/` has no other vote writer. A writer is a mismatch when current behavior differs from the permissions table.

## Topic and post election writers

`upsertTopicElectionVotes` and `upsertPostElectionVotes` (`services/elections-votes/shared/vote-upsert.mts`, rule in `shared/platform-account-votes.mts`) reject a platform account's votes, so no caller can write one by accident. Only the topic and post election configs opt in (`rejectsPlatformAccountVotes`); relation, rss-feed-item, user-vouch, hostname and agent-moderation votes use their own configs and writers and are unchanged.

- **Who:** the voter's `account_type` is non-null (`official`, `system` or `ai_agent`). It is read from `view_embedded_users`, the single derivation, inside the vote transaction after the per-user lock, so no second username, role or label list exists.
- **Rejected:** any non-null score, `1`, `-1` or `0`. A stored neutral `0` is a trust signal (`score = 0`, `score_is_neutral = true`), so it is rejected too, and so is repeating the account's current score. The error is `403` with code `OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN`, the same error as the HTTP guard. The whole call is rejected and nothing is written, so a batch that mixes a clear with a vote writes neither.
- **Allowed:** a clear, `score: null`. It appends a `NULL`-score row only when the account has a ballot to clear and is a no-op otherwise, so an account promoted after voting can still withdraw its old ballot. An empty batch is a no-op.
- **Residual window:** the check and the insert share one transaction, but role grants are not serialized with it. A grant that commits after the check and before the vote commits lets that one vote land; every later write is rejected.
- **Callers that skip the vote:** `services/rss-feeds/create-source.mts` and `services/fediverse-instances/create-instance.mts` cast the automatic +1 through `upsertAutomaticTopicUpvote`, which returns early for a platform account. The source is still created or found and the RSS follow is kept; a reply with `status: 'upvoted'` means the source already existed, not that a vote was written. The RSS import creates new feeds through `createSourceFromUrl`, and an import of an existing feed only follows it, so it casts no vote.

Callers of the two writers:

| Caller                                                                                                            | Classification                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/v1/topics/topic-routes/topic-vote-routes.mts` (PUT and DELETE) and `post-routes/comment-ancestors-route.mts` | `createVoteHandler` guards non-clears first and these routes do not opt out; the writer is the second line of defense. Clears pass.                               |
| `workers/entity-listeners/processors/posts.mts:52`                                                                | Creator auto-vote, already skipped for platform creators. Covered by `posts.platform-creator-upvote.test.mts`.                                                    |
| `services/rss-feeds/create-source.mts:59,123,162,178`                                                             | Automatic +1, skipped for platform accounts. Covered by `create-source.platform-accounts.test.mts`.                                                               |
| `services/fediverse-instances/create-instance.mts:46,65,73`                                                       | Automatic +1, skipped for platform accounts. Covered by `create-instance.platform-accounts.test.mts`.                                                             |
| `services/user-import-export/import-rss-feeds.mts:83`                                                             | Creates through `createSourceFromUrl`. Covered by `import-rss-feeds.platform-accounts.test.mts`.                                                                  |
| `playwright/helpers/insert-personalized-fixtures.mts:36,37,86,87`                                                 | Votes as plain member fixtures, unchanged.                                                                                                                        |
| Tests                                                                                                             | `election-vote-handler-retract.test.mts` and `election-vote-handler-noop.test.mts` voted as an official to test a clear; they now vote as a member, then promote. |

## Structural writers that keep working

These write election-backed structural relations, matching the "Vote on entity relations" row, so the restriction does not apply. #1849 requires them to keep working.

- `services/classifiers/topic-relation-actions.mts:96` and `topic-relation-votes.mts:25`: autotagger classifier writes a post or feed-item `category` topic relation and the actor vote. Covered by `topic-relation-actions.test.mts` (system and `ai_agent` actors).
- `services/post-classifier/effects.mts:40,74`: post classifier (`ai_agent`) writes a post `category` topic relation and the actor vote, through `applyTopicClassifierDecisionRelations` for the remote decision and a direct relation write with a +1 vote for the local detector's positive outcome. It writes no global topic election vote. Covered by `services/post-classifier/run-effects.test.mts` and `run-effects.part-2.test.mts`.
- `services/rss-feed-items/category-relations.mts:84,90,134`, `category-topic-votes.mts:94`, `reconcile-category-votes.mts:103`: rss-feed-categorizer writes feed-item category and hashtag relations and the actor votes. Covered by `categories.relations.test.mts` and `categories.clear-votes.test.mts`.
- `services/rss-feeds/category-relations.mts:64`: rss-feed-categorizer writes a feed `category` topic relation. Covered by `services/rss-feeds/__tests__/category-relations.test.mts`.
- `services/rss-feed-items/collaborative-topic-relations.mts:94`: collaborative categorizer writes feed-item topic relations with votes. Covered by `collaborative-topic-relations.test.mts`.
- `services/stories/story-post-create.mts:153`, `refresh-story-post.mts:133`, `story-post-relation-effects.mts:23-24`: story-teller (`ai_agent`) writes a story post `category` relation and the actor vote. Covered by `services/stories/__tests__/story-posts.projection.test.mts`.
- `services/stories/story-post-related-url-projection-relations.mts:146`: story-teller writes a story post related-URL relation and the actor vote. Covered by `story-post-related-url-projection-votes.test.mts`.
- `services/articles/sync.mts:122,130,148` to `services/posts/tagging.mts:68`: administrator (`official`) writes article post tag relations. Covered by `services/posts/tagging.generated.test.mts`.
- `services/posts/hashtag-votes.mts:163` and `services/posts/hashtags.mts:76,97`: post creator or editor writes hashtag and category relations and votes. Covered by `services/posts/__tests__/category-votes-transactional.test.mts`.
- `services/posts/create/source-url-relation.mts:57`: post creator writes a `related` URL relation and the creator vote. No test for a platform creator.
- `services/topic-recommendations/approve-topic-recommendation-side-effects.mts:71`: administrator (`official`) writes a topic `landing_page` relation and the approver vote. No test for a platform approver.
- `services/entity-relation-actions/create.mts:77`: REST create and MCP `add_entity_relation` write a structural relation and the creator vote for any platform account. Covered by `user-tags-authorization.test.mts` (user-tag branch only).
- `api/v1/entity-relations/entity-relation-votes.mts:54-56`: structural relation vote over HTTP for any platform account, which the guard allows. Covered by `entity-relations.official-vote.test.mts` (`official`, `system`, `ai_agent`).

## Not applicable

No election-backed vote or relation is written.

- `services/post-mentions/processors.mts:102,112,122` writes `mentioned`, which is not an election-backed predicate.
- `services/web-risk/check.mts:154` writes a hostname block, not a vote.
- `services/vote-integrity/apply-referral-link-penalty.mts` applies a vote-weight penalty, not a vote.
- `@automod`, `@ban-evasion` and the story-clustering classifier write no relation or vote.
- `services/admin-imports/process-topic-row-relations.mts:41`: an administrator writes `parent`, which is not election-backed.
- `services/posts/create/transaction-side-effects.mts:132` writes a data-point `category` relation with `vote: false`. Platform data-point creation is blocked at `services/posts/authorization.mts:62`.
- `services/ap-inbox-activities/dispatch-activity.mts:73,103`: a remote actor `follow`, not election-backed.
- `workers/entity-listeners/processors/users.mts:40`: referral auto-follow, not election-backed.
- `services/bookmarks/upsert.mts:98` and `services/user-import-export/{auto-follow-on-approval,import-rss-feeds,import-topics}.mts` write follow and bookmark relations, which are social and unrestricted.

## Where the restriction applies

- `api/election-vote-handler-guards.mts:14`, called at `election-vote-handler.mts:77`: blocks sentiment votes on every `createVoteHandler` route unless the route opts out. Clears are always allowed. Covered by `election-vote-handler.test.mts` (administrator) and `election-vote-handler.platform-accounts.test.mts` (`official`, `system`, `ai_agent`).
- `services/entity-relation-actions/user-tag-authorization.mts:17`: blocks user-tag relation add and vote, except for administrators. Covered by `user-tags-authorization.test.mts` (`system` and `ai_agent` rejected, administrator allowed).
- `services/bookmarks/upsert.mts:123`: blocks a follow casting a vouch. Covered by `upsert.follow-vouch.test.mts`.
- `services/elections-votes/shared/vote-upsert.mts`: the topic and post writers reject non-null votes from platform accounts and allow clears (see [Topic and post election writers](#topic-and-post-election-writers)). Covered by `shared/platform-account-votes.test.mts` (`official`, `system`, `ai_agent`, for both writers).
- `workers/entity-listeners/processors/posts.mts:51`: suppresses the creator auto-positive vote on the creator's own post. Covered by `posts.platform-creator-upvote.test.mts`.
- `services/posts/authorization.mts:62` and `services/posts/update/validation.mts:74`: block review and data-point create and edit. Covered by `create.review-content-validation.test.mts` and `update.review-content-validation.test.mts`.
- `services/user-referral-program-links/authorization.mts:39,54`: blocks personal referral links. Covered by `api/v1/referral-links/links.test.mts`.

## Administrator authority

The user-tag exemption (`user-tag-authorization.mts:17`) and the administrator moderation vote (`allowOfficialAccounts: true` at `api/v1/agents/agent-moderation.mts:51,68`, and the admin MCP tool `tools/admin/agent-votes.mts:47`) are intentional. The two routes that opt out of the vote guard are the structural relation vote (`shouldAllowOfficialAccount`) and the administrator moderation vote (`allowOfficialAccounts`). Topic-recommendation approval is administrator-only (`approve-topic-recommendation.mts:111`). MCP tools match REST: `add_entity_relation` goes through `createEntityRelationAction`, the same guard as the REST route, and `withdraw_entity_relation_vote` only retracts.

## Mismatches

M1 to M4 are resolved.

- **M1** Resolved: classifier and AI accounts vote only on entity relations, never on topic or post elections ([decision, 2026-10-05](https://github.com/vouchington/vouchington/issues/1834#issuecomment-5999417459)). The post classifier now votes on the post's own `category` relation, and the global topic vote path was removed.
- **M2** Resolved: `POST /api/v1/rss-feeds` and the RSS import (`services/rss-feeds/create-source.mts:59,123,162,178`, `services/user-import-export/import-rss-feeds.mts:83`) no longer cast the automatic +1 topic vote for a platform account, and the topic writer rejects it if a caller tries. The source is still created and the follow is kept.
- **M3** Resolved: `POST /api/v1/fediverse/instances` (`services/fediverse-instances/create-instance.mts:46,65,73`) no longer casts the automatic +1 topic vote for a platform account, on the new, existing and race paths. The instance is still created.
- **M4** Resolved: the "Moderator agent: tag post + move to review queue" row described helpers (`services/moderators/tagging.mts`) that had no production caller, so the package and its docs page were deleted. The community moderation classifier sends a flagged post to the review queue or unpublishes it, per the community's `automod_action` (`record_only`, `review_queue` or `unpublish`; see `services/community-agent-prompts/moderation-run-effects.mts`), and writes no relation or vote. Tagging stays under the entity-relations row.

#1849 requires structural relation votes and administrator user-tag authority to keep working, and the structural writers section is covered by tests for that.
