# Entity relation actions

Source entrypoint: [backend/services/entity-relation-actions/README.md](../../../../../backend/services/entity-relation-actions/README.md)

`createEntityRelationAction` is the shared POST command for first-party REST and delegated
credential callers. It preserves the route's tuple, community, user-tag, contribution, standing
limit, vote-refresh, and viewer-scoped readback behavior.

Callers must supply explicit `first_party` or `delegated` authority. Delegated post participants
first pass ordinary visibility and domain policy, then require the exact own-private capability and
credential ownership of both the candidate and its effective root. The upsert callback repeats the
check after canonical candidate/root publication locks.

`upsertBookmarkAction` and `deleteBookmarkAction` are the shared bookmark commands behind the
PUT/DELETE bookmark routes and the `set_bookmark`/`remove_bookmark` MCP tools. Delete never reads
the target, so it needs no authority. `assertPostTargetAccess` applies the same delegated
post-visibility and own-private rules to a post a caller reaches indirectly, such as the MCP
`add_list_item` tool.

`assertUserTagAllowed` is shared with the entity-relation vote route so the curated user-tag
domain guard has one owner.
