# Relation, Referral Link and Topic Recommendation Write Tools

Nine MCP-only tools write a user's own tags, referral links and pending topic recommendations. Each
runs the same shared service command as its REST twin, so the permission, suspension, guard and
ownership rules do not fork, and an MCP credential has the same permissions as the signed-in user:
scopes and consent only delegate that authority. All require `plan: 'plus'` and the full resource
pair, and a read-only grant never satisfies the write scope. The per-call MCP audit records every
call. The generated [tool catalog](catalog.md) holds each description, hint and scope; the
[agent tools overview](README.md) covers metadata and plan gating.

| Tool                            | REST twin                                           | Notes                                                                      |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| `remove_entity_relation`        | `PATCH /api/v1/posts/:idOrSlug` (categories)        | `action: remove_tag`; scopes `entity-relations:read/write`                 |
| `create_referral_link`          | `POST /api/v1/referral-links`                       | Always for the caller; re-adding a link reactivates it and keeps its label |
| `update_referral_link`          | `PATCH /api/v1/referral-links/:linkId`              | Changes the label; a null label clears it                                  |
| `delete_referral_link`          | `DELETE /api/v1/referral-links/:linkId`             | Deleting a deleted link is not found; returns `{ success: true }`          |
| `activate_referral_link`        | `POST /api/v1/referral-links/:linkId/activations`   | Child links follow their parent and are refused                            |
| `deactivate_referral_link`      | `DELETE /api/v1/referral-links/:linkId/activations` | Idempotent                                                                 |
| `request_referral_link_unfurl`  | `POST /api/v1/referral-links/:linkId/unfurls`       | Amex all-cards links of a paid owner only; the work runs in the background |
| `update_topic_recommendation`   | `PATCH /api/v1/topic-recommendations/:id`           | Pending only; omitted fields are kept                                      |
| `withdraw_topic_recommendation` | `DELETE /api/v1/topic-recommendations/:id`          | Pending only; withdrawing a withdrawn one is not found                     |

Referral link tools use `referral-links:read` and `referral-links:write`; recommendation tools use
`topic-recommendations:read` and `topic-recommendations:write`. The recommendation read scope has
no read tool yet. Every tool refuses a suspended account before any change, and validates its
arguments (a closed schema, so unknown fields fail) before it runs. Ownership and the domain checks
stay in the service commands and throw the status and message the route sends. Official accounts,
administrators included, cannot create or edit a personal referral link, as on REST, so
`create_referral_link` takes no `user_id`; an administrator can still activate, deactivate and delete
another user's link. The MCP call path
reports a thrown error and returns its generic `Tool execution failed. Please try again.` text, as
for every other write tool, while scope, plan and argument refusals keep their own messages.

## Tags: add, remove and the hidden curry

`add_entity_relation` (`action: add_tag`) and `remove_entity_relation` (`action: remove_tag`) are a
pair over the post category update, the way the web edits tags. The internal curried
`add_related_topic` stays internal; the remove tool does not widen it. Both follow the private-post
rule of `add_entity_relation`: an own private post needs the exact
`post-relations.owned-private:write` grant, and another user's private post stays hidden. A missing
freeform `#tag` is created by the add path as the domain already does (see [Tags](../../../requirements/content/TAGS.md)).

Removing a tag the post's title or text writes is refused with `422` before any write: those tags
come from the text, so edit the text. Removing a tag the post does not carry changes nothing and
returns `removed: false`, so a repeat removal behaves idempotently. The tool still declares
`idempotentHint: false` because the registry ties that hint to its `PATCH` REST twin: only tools
whose every REST operation is `PUT` or `DELETE` are idempotent.

## Topic recommendations and `dismiss_recommendation`

The two recommendation tools act on a recommendation the caller submitted, while it is pending.
`dismiss_recommendation` is a different thing: a bookmark predicate that hides a recommended topic
from a feed, not a change to a submitted recommendation. It stays REST-only, as
[Bookmark and List Write Tools](bookmark-list-write-tools.md) decided, and `set_bookmark` rejects it.
The tag tools and the recommendation tools do not overlap: one edits a post's hashtags, the other
edits the proposed-topic extension of a `topic_recommendation` post.

`update_topic_recommendation` returns the post the PATCH route documents. The service post also
holds fields the documented `Post` does not list (an internal moderation flag, and display fields on
the author stubs), and the REST route sends them as they are. The result schema is closed, so the
tool prunes the post to the documented properties with `pruneToSchema`, rather than failing a call
whose change was already made.

## REST write inventory

| REST write                                                                                                     | Tool or decision                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType`                                   | `add_entity_relation` (existing)                                                                      |
| `PATCH /api/v1/posts/:idOrSlug` (remove a hashtag)                                                             | `remove_entity_relation`                                                                              |
| `PUT` and `DELETE /api/v1/entity-relations/:id/vote`                                                           | No tool: the vote handlers are request-bound and there is no shared request-free command; a follow-up |
| `POST`, `PATCH`, `DELETE /api/v1/referral-links`, `.../:linkId`                                                | `create_referral_link`, `update_referral_link`, `delete_referral_link`                                |
| `POST` and `DELETE /api/v1/referral-links/:linkId/activations`                                                 | `activate_referral_link`, `deactivate_referral_link`                                                  |
| `POST /api/v1/referral-links/:linkId/unfurls`                                                                  | `request_referral_link_unfurl`                                                                        |
| `POST`, `PATCH`, `DELETE /api/v1/referral-link-validations`, `.../rules`                                       | No tool: topic curation under `currentUserCanUpdateTopic`, not the caller's own links                 |
| `POST /api/v1/referral-programs/:id/official-referral-links`, `DELETE /api/v1/official-referral-links/:linkId` | No tool: administrator-only (`currentUserCanManageOfficialReferralLink`); admin tools                 |
| `PUT /api/v1/crawlers/referral-program`                                                                        | No tool: administrator-only crawler setup; admin tools                                                |
| `PATCH /api/v1/topics/:idOrSlug/referral-program`                                                              | No tool: topic curation under `currentUserCanUpdateTopic`; a topic write tool, not a link tool        |
| `POST /api/v1/topic-recommendations`                                                                           | No tool: CAPTCHA and contribution admission are request-bound                                         |
| `PATCH`, `DELETE /api/v1/topic-recommendations/:id`                                                            | `update_topic_recommendation`, `withdraw_topic_recommendation`                                        |
| `POST /api/v1/topic-recommendations/:id/approvals`, `.../rejections`                                           | No tool: administrator review (admin tools)                                                           |
| `PUT /api/v1/bookmarks/:entityType/:entityId/dismiss_recommendation`                                           | No tool: stays REST-only                                                                              |

The result schemas come from the generated OpenAPI components (`UserReferralLink`, `Post`), and
`backend/tools/referral-link-recommendation-output-schema.test.mts` pins them to the documented REST
bodies.
