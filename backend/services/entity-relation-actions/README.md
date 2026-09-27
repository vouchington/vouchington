# Entity relation actions

`createEntityRelationAction` is the shared POST command for first-party REST and delegated
credential callers. It preserves the route's tuple, community, user-tag, contribution, standing
limit, vote-refresh, and viewer-scoped readback behavior.

Callers must supply explicit `first_party` or `delegated` authority. Delegated post participants
first pass ordinary visibility and domain policy, then require the exact own-private capability and
credential ownership of both the candidate and its effective root. The upsert callback repeats the
check after canonical candidate/root publication locks.

`assertUserTagAllowed` is shared with the entity-relation vote route so the curated user-tag
domain guard has one owner.
