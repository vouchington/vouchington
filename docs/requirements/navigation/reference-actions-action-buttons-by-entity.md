# Action Buttons reference

[Back to Action Buttons](ACTIONS.md)

## Action Buttons by Entity

### Topics

| Action                   | Component              | Location                    | Auth                              | Tooltip                                               |
| ------------------------ | ---------------------- | --------------------------- | --------------------------------- | ----------------------------------------------------- |
| Trust choice             | `ScoreVote`            | Hero header                 | Auth (disabled w/ tooltip if not) | "Vouch", "Like", "Neutral", "Dislike", or "Disavow"   |
| Follow                   | `FollowButton`         | Hero header                 | Auth                              | "Follow this topic to see its posts in your feed"     |
| Follow Source (rss_feed) | `FollowButton`         | Hero header (source topics) | Auth                              | "Follow this source to see its articles in your feed" |
| Mute                     | `EntityBookmarkButton` | Aside (`TopicActionsAside`) | Auth                              | "Hide this topic from your feed"                      |
| Follow (list)            | `FollowButton`         | `TopicCard`                 | Auth                              | "Follow this topic to see its posts in your feed"     |
| Mute (list)              | `EntityBookmarkButton` | `TopicCard`                 | Auth                              | "Hide this topic from your feed"                      |

> **Source topic note:** On pages where `topic.topic_type === 'rss_feed'` and an rss_feed is linked (`rssFeedId` is set), the hero renders **two** Follow buttons side by side: **Follow Source** (targets the `rss_feed` entity, `data-pw='follow-source-button'`) and **Follow Topic** (targets the `topic` entity, `data-pw='follow-topic-button'`). When no rss_feed is linked, only the standard Follow Topic button renders (`data-pw='follow-button'`). Mute is **always in the aside** — never in the hero.

The topic aside (`TopicActionsAside`) includes quick-action Contribute links. Each link appends `?topic_id=<id>` so the create form pre-selects the current topic. Visibility and pre-fill rules:

| Link               | Hidden when                                              | Pre-fill on create page                                                                           |
| ------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Write a Review     | `allow_reviews === false`                                | First review row seeded with topic id + name; rating starts at 0                                  |
| Share a Data Point | `topic_type !== 'card' && topic_type !== 'bank_account'` | Vertical pre-selected (`credit_card` or `bank_account`); topic autocomplete seeded                |
| Start a Discussion | Never hidden                                             | Categories field pre-populated with the topic; writes `relation__post__category__topic` on submit |

### Users

| Action             | Component              | Location                                                                     | Auth           | Tooltip (inactive / active)                          |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------- | -------------- | ---------------------------------------------------- |
| Follow             | `FollowButton`         | Hero header                                                                  | Auth, not self | "They'll be notified when you follow them"           |
| Subscribe to Posts | `EntityBookmarkButton` | Aside (`UserActionsAside`)                                                   | Auth, not self | "Get notified when this user creates new posts"      |
| Mute               | `EntityBookmarkButton` | Aside (`UserActionsAside`); user list rows (`UserList`, `UserSearchResults`) | Auth, not self | "Hide this user from your feed" / "Unmute this user" |
| Block              | `EntityBookmarkButton` | Aside (`UserActionsAside`)                                                   | Auth, not self | "Block this user from interacting with you"          |
| User tag vote      | `UserTagsAside`        | Aside and Manage modal                                                       | Auth, not self | "Vouch for this tag" / "Disavow this tag"            |
| Report             | `ReportInlineButton`   | Aside (`UserActionsAside`)                                                   | Auth, not self | "Report this content to moderators"                  |

> **Design note:** User Block is intentionally restricted to `UserActionsAside` on the profile page — a deliberate action taken after viewing a profile. User Mute is available both in `UserActionsAside` and in user list rows (`UserList`, `UserSearchResults`), where `initialActive` is batch-loaded from the API response `muted` map so no per-row client-side fetch is required.

### Posts

| Action       | Component              | Location                              | Auth                      | Tooltip                       |
| ------------ | ---------------------- | ------------------------------------- | ------------------------- | ----------------------------- |
| Trust choice | `ScoreVote`            | Post detail, Post card                | Auth (counts-only if not) | Semantic sentiment choices    |
| Save         | `EntityBookmarkButton` | `PostDetailActions`, `PostCardFooter` | Auth                      | "Save this post for later"    |
| Hide         | `HideButton`           | `PostDetailActions`, `PostCardFooter` | Auth                      | "Hide" / "Unhide"             |
| Subscribe    | `EntityBookmarkButton` | Post detail                           | Auth                      | "Get notified of new replies" |
| Share / Send | `FollowerShareActions` | Post detail                           | Auth, not author          | —                             |
| Edit         | Link                   | `PostDetailActions`                   | Author (24h) or Admin     | —                             |
| Delete       | AlertDialog            | `PostDetailActions`                   | Author or Admin           | —                             |

### Comments

| Action       | Component              | Location             | Auth                      | Tooltip                       |
| ------------ | ---------------------- | -------------------- | ------------------------- | ----------------------------- |
| Trust choice | `ScoreVote`            | `CommentNodeActions` | Auth (counts-only if not) | Semantic sentiment choices    |
| Reply        | Inline form trigger    | `CommentNodeActions` | Auth                      | "Reply to this comment"       |
| Save         | `EntityBookmarkButton` | `CommentNodeActions` | Auth                      | "Save this comment for later" |
| Edit         | Inline form            | `CommentNodeActions` | Author (24h) or Admin     | —                             |
| Delete       | AlertDialog            | `CommentNodeActions` | Author or Admin           | —                             |

### Report

The Report action is available on `rss_feed_item`, `post`, `comment`, `user`, and `url_hostname`. It is auth-only and never shown to signed-out users.

| Action                 | Component            | Location                                   | Auth           | Tooltip (unsent)                    | Tooltip (sent)                 |
| ---------------------- | -------------------- | ------------------------------------------ | -------------- | ----------------------------------- | ------------------------------ |
| Report (rss_feed_item) | `ReportMenuItem`     | `FollowerShareActions` kebab (`...`)       | Auth           | "Report this content to moderators" | "Report submitted — thank you" |
| Report (rss_feed_item) | `ReportInlineButton` | News-item modal footer (`NewsItemActions`) | Auth           | "Report this content to moderators" | "Report submitted — thank you" |
| Report (post)          | `ReportMenuItem`     | `FollowerShareActions` kebab (`...`)       | Auth, not self | "Report this content to moderators" | "Report submitted — thank you" |
| Report (comment)       | `ReportMenuItem`     | Header `...` kebab (`ReportMenuKebab`)     | Auth, not self | "Report this content to moderators" | "Report submitted — thank you" |
| Report (user)          | `ReportInlineButton` | Aside (`UserActionsAside`)                 | Auth, not self | "Report this content to moderators" | "Report submitted — thank you" |
| Report (url_hostname)  | `ReportInlineButton` | Domain, URL, and crawl detail actions      | Auth           | "Report this content to moderators" | "Report submitted — thank you" |

Clicking any Report trigger opens `ReportDialog` — a modal with a reason radio group (`spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other`) plus an optional free-text note. `vote_manipulation` is valid only for `post` reports. Submission creates a `moderation_reports` row via `POST /api/v1/reports`. Duplicate submissions for the same entity are idempotent (200 response). Rate limit: ~10/hour per user (sensitive category, 3600s TTL).

URL and crawl detail actions resolve the URL's canonical hostname UUID and submit `url_hostname`.
They never submit the URL UUID or a separate `url` entity type.

See [REPORTING.md](../moderation/REPORTING.md) for the full spec including admin review flow.
