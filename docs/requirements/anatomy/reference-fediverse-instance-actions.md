# Fediverse Instance Anatomy reference

[Back to Fediverse Instance Anatomy](fediverse-instance.md)

## Actions

| Action                                            | Who can act                               |
| ------------------------------------------------- | ----------------------------------------- |
| Follow / Unfollow                                 | Signed-in users                           |
| Mute                                              | Signed-in users                           |
| Semantic trust choice (topic election)            | Signed-in users                           |
| Semantic trust choice (hostname trust badge)      | Signed-in users                           |
| Add instance to directory                         | Signed-in users (planned; see note below) |
| Set integration status (pending/approved/blocked) | Admins                                    |

`fediverse_instance` has no dedicated bookmark entity_type in the entity-relations config
(`backend/types/entities/entity-relations-config-relations.mts`) — unlike `rss_feed`, which
registers its own `follow`/`subscribe`/`mute` relations. Follow and Mute reuse the generic `topic`
bookmark relations (`PUT /api/v1/bookmarks/topic/:id/follow`, `PUT /api/v1/bookmarks/topic/:id/mute`)
that already apply to any topic row regardless of `topic_type`.

Voting reuses existing elections — no new vote infrastructure. The topic-level vote uses the
generic `topic` vote endpoint (`PUT /api/v1/topics/:id/vote`); the hostname trust badge uses the
generic `hostname` vote endpoint (`PUT /api/v1/hostnames/:id/vote`) — same as
[domain](./domain.md#actions) semantic trust choice. See [topic](../reference-topic.md) and [domain](../reference-domain.md).

Admin allowlist decisions are gated by `currentUserCanModifyFediverseInstanceIntegrationStatus`
(administrator role only) and written via the service-layer
`setIntegrationStatusAsAdmin` function (`backend/services/fediverse-instances/integration-status.mts`),
which inserts an append-only `fediverse_instance_integration_changes` row rather than updating
`integration_status` in place. **No API route exposes this yet** — the service function exists but
is not yet wired to `backend/api/v1/fediverse/`; the eventual endpoint path is unconfirmed as of
this writing.

**"Add instance to directory" is per the Phase B architecture plan** ("Any signed-in user can add
an instance to the directory; the owner controls integration via the allowlist, not creation") but
no submission UI or creation endpoint exists yet — `/instances` has no `SubmitInstanceButton`
equivalent to `/sources`' `SubmitSourceButton` as of this writing. Like `rss_feed`,
`fediverse_instance` is excluded from `NON_SOURCE_TOPIC_TYPE_OPTIONS` (`web/types/topics.ts`)
because both types are meant to be created through their own dedicated flow rather than the
generic admin topic-type dropdown — for sources that flow is the `/sources` submit dialog; for
instances the equivalent flow is not yet built.

## Related

- [topic](./topic.md) — base entity; fediverse instances inherit topic lifecycle and actions
- [source](./source.md) — structurally analogous topic type (extension table + auto-created, non-manually-assignable `topic_type`)
- [domain](./domain.md) — hostname trust badge shown in instance list rows and used for the hostname-level vote
