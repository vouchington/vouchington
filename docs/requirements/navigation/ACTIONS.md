# Action Buttons

Action buttons let users interact with topics, posts, and other users. This page records the
placement and tooltip decisions; the per-entity button inventory is read from the components.

## Principles

- **Hero** (entity header): primary engagement actions every authenticated user sees, namely Follow
  and Vouch / Disavow.
- **Aside** (right sidebar): moderation, management, and subscription actions only the current user
  sees. Subscribe, Mute, Block, user tag votes, and Report live here, never in the hero.
- **Inline in cards**: convenience actions such as Follow and Mute on topic cards so users need not
  open the detail page.
- **Every action button has a tooltip.** New users do not know what buttons mean. Tooltips are
  concise, explain what happens on click rather than restating the label, and appear immediately.
- **No N+1 fetches in lists.** Buttons inside list views receive their initial state from a batch
  response and never lazy-fetch their own status.

Moderation transparency is read-only aggregate data, not an action control. It never reveals
reporter or moderation-record actions; see [Moderation Analytics](../moderation/MODERATION-ANALYTICS.md).

### Report

The Report action is available on `rss_feed_item`, `post`, `comment`, `user`, and `url_hostname`. It is auth-only and never shown to signed-out users.

Clicking any Report trigger opens a modal with a reason radio group (`spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other`) plus an optional free-text note. `vote_manipulation` is valid only for `post` reports. Submissions are idempotent per entity.
