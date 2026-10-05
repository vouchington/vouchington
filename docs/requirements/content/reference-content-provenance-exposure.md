# Content provenance exposure

[Back to Content Provenance](content-provenance.md#exposure)

[#706](https://github.com/vouchington/vouchington/issues/706) shows the credential-grade channels
on posts. `resolvePublicProvenanceLabel`
([`backend/services/content-provenance`](../../../backend/services/content-provenance/resolve-public-provenance-label.mts))
is the one place that decides what a viewer sees.

**Public label.** Only `api` and `mcp` rows carry one. The `web`, `swift`, `dotnet` and `system`
channels are telemetry-grade or server-assigned, so they never appear publicly. The app name has
four tiers, and the first that applies wins:

| Tier | Client                                                                    | `app_name`                           |
| ---- | ------------------------------------------------------------------------- | ------------------------------------ |
| 1    | CIMD client whose `metadata_url` is on the reviewed `KNOWN_OAUTH_CLIENTS` | The reviewed display name            |
| 2    | Any other CIMD client                                                     | The `metadata_url` hostname          |
| 3    | Dynamically registered client with staff `verified_at` set                | Its `client_name`                    |
| 4    | Anything else, including a row with no OAuth client                       | `null`: plain "via API" or "via MCP" |

The allowlist lives in
[`known-clients.mts`](../../../backend/services/oauth-authorization-server/known-clients.mts), and
stays empty until a name and its document URL are reviewed together. A client's own claimed name
is never shown unless staff verified it.

**Shape.** A post carries optional `provenance: { via: 'api' | 'mcp', app_name: string | null }`.
The server returns structured data, not English: each client composes "via API", "via MCP" or
"via {app}" from its own localized copy.

**Staff view.** Administrators and moderators also get optional `staff_provenance`, with the
`created_via` of every channel and the raw `oauth_client` (`client_id`, `client_name`,
`metadata_url`, `verified`). No other viewer, including the author, receives it. MCP carries the
public label only.

**Anonymous posts.** A named app can identify its owner, so an anonymous post shows `app_name:
null` to any viewer who cannot see the author: everyone except the author and administrators. The
channel itself stays visible. For moderators, `staff_provenance` keeps `created_via` and omits
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
`get_trending_posts`) and omnisearch have nothing to attach it to. The author's own `POST` and
`PATCH` post responses, and the MCP `create_post` and `update_post` results, are mutation echoes
rather than read projections, so they carry no label.

**Not yet exposed.** Communities, topics, lists and RSS feeds have the columns but no label yet:
[#2046](https://github.com/vouchington/vouchington/issues/2046). Native client rendering is
[vouchington-clients#206](https://github.com/vouchington/vouchington-clients/issues/206).

The web client renders the label as a badge on post cards and post details, and moderation staff see
the raw channel and client on the same surfaces.
