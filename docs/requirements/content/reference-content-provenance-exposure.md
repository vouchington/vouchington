# Content provenance exposure

[Back to Content Provenance](content-provenance.md#exposure)

[#706](https://github.com/vouchington/vouchington/issues/706) shows the credential-grade channels
on posts. `resolvePublicProvenanceLabel`
([`backend/services/content-provenance`](../../../backend/services/content-provenance/resolve-public-provenance-label.mts))
is the one place that decides what a viewer sees.

**Public label.** Only `api` and `mcp` rows carry one. The `web`, `swift`, `dotnet` and `system`
channels are telemetry-grade or server-assigned, so they never appear publicly. The `app` has four
tiers, and the first that applies wins:

| Tier | Client                                                                    | `app`                                                         |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | CIMD client whose `metadata_url` is on the reviewed `KNOWN_OAUTH_CLIENTS` | `{ kind: 'known', key }`, the entry's lowercase slug          |
| 2    | Any other CIMD client                                                     | `{ kind: 'hostname', hostname }`, the `metadata_url` hostname |
| 3    | Dynamically registered client with staff `verified_at` set                | `{ kind: 'verified', client_id, client_name }`                |
| 4    | Anything else, including a row with no OAuth client                       | `null`: plain "via API" or "via MCP"                          |

The allowlist lives in
[`known-clients.mts`](../../../backend/services/oauth-authorization-server/known-clients.mts), and
stays empty until a key, a name and a document URL are reviewed together. Each entry is
`{ key, name }`. The `key` is a lowercase slug that a test validates, and it is the only part of an
entry that the provenance label carries. The `name` is what the consent screen and the connected-apps
list show, and it never reaches a post. A client's own claimed name is never shown unless staff
verified it, and the tier 3 `client_name` is that verified name, because renaming a client drops its
verification.

**Shape.** A post carries optional `provenance: { via, app }`, where `via` is `'api' | 'mcp'` and
`app` is one of the tier shapes above or `null`, as decided in the
[#706 comment](https://github.com/vouchington/vouchington/issues/706#issuecomment-5999118952). The
server returns facts: a slug, a hostname, an id or a staff-verified name, never free text and never
the wording a user sees. Each client composes "via API", "via MCP" or "via {app}" from its own
localized copy:

- `known`: look up the display name by `key` in the client's catalog. A key with no copy there falls
  back to the plain channel label, and the client never renders the raw key.
- `hostname`: "via {hostname}".
- `verified`: "via {client_name}".
- `null`: "via API" or "via MCP".

Adding an allowlist entry therefore also adds its key's display copy to the web catalog
(`web/components/posts/known-app-name-keys.ts` maps the key to that copy), and later to the native
catalogs.

**Staff view.** Administrators and moderators also get optional `staff_provenance`, with the
`created_via` of every channel and the raw `oauth_client` (`client_id`, `client_name`,
`metadata_url`, `verified`). No other viewer, including the author, receives it. MCP carries the
public label only.

**Anonymous posts.** A named app can identify its owner, so an anonymous post shows `app: null` to
any viewer who cannot see the author: everyone except the author and administrators. The channel
itself stays visible. For moderators, `staff_provenance` keeps `created_via` and omits
`oauth_client`, matching what moderators already cannot learn about an anonymous author.

**Computed per request.** The columns stay out of the cached `Post` and out of `view_posts`.
After the cache read, one batched query joins `posts` to `oauth_clients` and the response gets
copies of the posts with the fields set, so a rename or an unverify shows on the next read. Routes
that mask anonymous authors attach the label before masking, because masking hides the author id
the rule needs.

**Where it appears.** Every route that reads posts for display: post detail, the posts list,
comment ancestors and descendants, community posts and news, feed posts and RSS feed items,
trending posts, topic recommendations, list items, user collections and story related posts, plus
the MCP `get_post`, `get_post_ancestors`, `get_post_descendants`, `get_community_posts` and
`get_community_pinned_posts`. Lean result summaries that carry no post entity (`search_posts`,
`get_trending_posts`) and omnisearch have nothing to attach it to.

**Write echoes.** The post that `POST /api/v1/posts`, `POST /api/v1/communities/:idOrSlug/posts`
and `PATCH /api/v1/posts/:idOrSlug` return, and the post in the MCP `create_post` and `update_post`
results, carries the same fields a read of it would, so a client that just wrote a post never needs
a second request to show the badge. The REST routes apply the rules for the writer, which adds
`staff_provenance` when the writer is moderation staff. MCP carries the public label only, and its
signed-out rule hides the app of an anonymous post even from its author. A session write from the
web or a native app records a telemetry-grade channel, so its echo carries no `provenance` and only
staff get `staff_provenance`. The echo is read from the primary, because the row was committed an
instant ago. The label is attached to the response and never to a stored post, so an idempotent
retry of a create returns the label as it is now, such as a client's renamed or newly verified app,
while the stored result stays unlabeled.

**Not yet exposed.** Communities, topics, lists and RSS feeds have the columns but no label yet:
[#2046](https://github.com/vouchington/vouchington/issues/2046). Native client rendering is
[vouchington-clients#206](https://github.com/vouchington/vouchington-clients/issues/206).

The web client renders the label as a badge on post cards and post details, and moderation staff see
the raw channel and client on the same surfaces.
