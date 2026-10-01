# Post and Story Read Tools

[Back to MCP Tools service](README.md#structured-tool-results)

`get_post`, `get_post_ancestors`, `get_post_descendants` and `get_story` read a post, its thread and
a news story. Each requires the `posts:read` scope, is read-only, names its REST twin in `meta.api`,
and sits on the `internal`, `mcp` and `client` surfaces like the other post tools.

| Tool                   | REST twin                                 | Arguments                                              |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `get_post`             | `GET /api/v1/posts/:idOrSlug`             | `post_id` (UUID or slug)                               |
| `get_post_ancestors`   | `GET /api/v1/posts/:idOrSlug/ancestors`   | `post_id` (UUID or slug)                               |
| `get_post_descendants` | `GET /api/v1/posts/:idOrSlug/descendants` | `post_id`, `limit` (1-200), `after`                    |
| `get_story`            | `GET /api/v1/stories/:id`                 | `story_id`, `limit` (1-25), `after`, `exclude_item_id` |

## Result shape

Each tool owns a closed output schema (`backend/tools/mcp-post-output.mts`, `mcp-story-output.mts`)
whose fields are picked from the generated REST `Post`, `Story`, `ViewRssFeedItem` and `PageInfo`
components, and `post-read-tools.output-schema.test.mts` pins every field to `openapi.json`. The
result is `{ success: true, ... }` or `{ success: false, error }`, so expected bad input (a missing
post, a malformed cursor) never surfaces as a tool failure. `after` is the opaque
`page_info.end_cursor` of the previous page, and a malformed one returns `Invalid cursor`.

Post markdown and article markdown are wrapped with `wrapExternalContent`, and titles are sanitized
like the `search_posts` and `search_rss_feed_items` results.

## Privacy

MCP is parity minus private data. `resolveReadableThread` (`backend/tools/mcp-post-access.mts`)
answers a post as `Post not found` unless every live node of its parent chain passes the shared
`canViewPostsBatch` policy both as the credential owner and as a signed-out reader. A post the owner
sees only through private visibility (a private audience, a private community, or their own
unapproved post) is therefore never returned, even to its author, and a topic recommendation is
never returned. One hidden ancestor hides the whole thread, so a `parent_id`, title or count never
reveals it.

`get_post_descendants` pages with the REST descendants page (`getCommentDescendantsPage`), whose
cursors are scoped to the thread and never to a viewer; a hidden reply prunes its subtree. A deleted
post is left out rather than tombstoned, because the `view_posts` read model does not return it, so
a `parent_id` can name a post that is not listed. Anonymous posts hide their author from every
caller, including the author.

`get_story` needs no owner-and-signed-out check. Stories are public, and the only viewer-dependent
filters on their articles (`getStoryMemberPagesBatch`) are the owner's own mutes, hides and excluded
hostnames, which only remove articles, so no article is reachable through private visibility.
