# Own Profile, Notification, Preference and Recommendation Read Tools

Seven MCP read tools return the caller's own bio, profile links, notifications, email preferences,
settings and topic recommendations. They are the reads for the
[profile, notification and preference write tools](profile-notification-write-tools.md) and the
[topic recommendation write tools](relation-referral-recommendation-write-tools.md): each reads
what one of those tools changes. Each is read-only (`readOnlyHint`), names its REST twin in
`meta.api`, sits on the `internal`, `mcp` and `client` surfaces, and needs no paid plan. The
generated [tool catalog](catalog.md) holds each tool's description and scopes; the
[agent tools overview](README.md) covers metadata and plan gating.

| Tool                            | REST twin                                  | Scope                        | Arguments                  |
| ------------------------------- | ------------------------------------------ | ---------------------------- | -------------------------- |
| `get_my_notifications`          | `GET /api/v1/my/notifications`             | `notifications:read`         | `limit`, `after`           |
| `get_my_unread_notifications`   | `GET /api/v1/my/notifications/unread`      | `notifications:read`         | none                       |
| `get_my_bio`                    | `GET /api/v1/my/profile`                   | `profile:read`               | none                       |
| `get_my_profile_links`          | `GET /api/v1/my/profile/links`             | `profile:read`               | none                       |
| `get_my_email_preferences`      | `GET /api/v1/my/email-preferences`         | `preferences:read`           | none                       |
| `get_my_preferences`            | `GET /api/v1/users/:idOrSlug` (own record) | `preferences:read`           | none                       |
| `list_my_topic_recommendations` | `GET /api/v1/topic-recommendations` (own)  | `topic-recommendations:read` | `status`, `limit`, `after` |

No scope is new, and `mcp.user:read` already covers all four. Every tool acts on the credential's
own account and takes no user id, so another user's data cannot be asked for. Each re-reads that
account from the primary database before it reads anything, so an account deleted after the
credential was issued is refused with `401` instead of still returning the rows that outlive it.
Each owns a closed output schema built from the generated REST contracts, and a test pins every
property to the documented response.

## Notifications

`get_my_notifications` lists every notification, read or not, newest first, at most 100 per page
(default 25), the REST bounds. `results` lists the notification ids in order, `notifications`
holds each one by id and `communities` holds the public communities, or the caller's own, they
mention. `page_info.end_cursor` is the REST cursor, so it round-trips with the route; a malformed
cursor, an empty one included, returns `{ success: false, error: "Invalid cursor" }`.

`get_my_unread_notifications` returns `unread_count`, the total, and the newest 10 unread
notifications in the same three records.

A notification's `title`, `actor_label` and a community's `name` can quote other users, so they are
sanitized as titles. The `body` is sanitized and fenced as `external-content` from `notification`.
An empty body, as a direct message has, stays an empty string, the REST type. A notification has no
`target_path`: that is a frontend route, and the tools return what it is about as `target_entity`,
`target_intent` and the ids of the records it points at. Reading never marks
a notification read; `mark_notification_read` and `mark_all_notifications_read` do that.

## Profile

`get_my_bio` returns `{ id, markdown }` exactly as stored, an empty string when there is no bio.
It is the account's own text, so it is neither sanitized nor fenced, and what it returns can be
edited and sent back to `update_my_bio` unchanged. `get_my_profile` reads the wallet profile
instead.

`get_my_profile_links` returns the links in display order with the fields REST returns. There are
at most 20, so the list is not paged. A link's `name`, `handle` and `url` are the account's own
text and are not sanitized. The ids go to `update_my_profile_link`, `delete_my_profile_link` and
`reorder_my_profile_links`.

## Email preferences and settings

`get_my_email_preferences` returns `email_preferences`: which digests and summaries the caller
receives, and their cadence, weekdays, time of day and time zone. Email addresses are not part of
it.

`get_my_preferences` returns `settings`, the twelve fields `update_my_preferences` changes: who can
see the caller's follows, followers, likes and community memberships, who can message them, the
default audience and privacy of new posts, country, interface locale and Hacker News discussions.
They are read from the account's private user record on the primary database, so a read straight
after an update sees it. A field the account has never set is `null`. Financial-data visibility,
consents, federation, email addresses, sign-in settings and the username are not included.

## Topic recommendations

`list_my_topic_recommendations` lists the recommendations the caller submitted, best-ranked first
like the REST list, whatever their status; `status` (`pending`, `approved` or `rejected`) narrows
it. `results` lists the ids in order and `posts` holds each recommendation by id, with the same
post `update_topic_recommendation` returns, minus the internal moderation columns and with its text
fenced as below. A pending one can still be edited or withdrawn; an approved or rejected one carries
its reviewer and, when rejected, the reason. Withdrawn recommendations are not listed. Pages hold at
most 100 (default 25), the REST bounds. `page_info.end_cursor` is a score cursor scoped to the
caller and the `status`: it continues the same listing only, so a cursor used with another status,
another account or the REST list returns `{ success: false, error: "Invalid cursor" }`.

`GET /api/v1/topic-recommendations` lists every user's recommendations and has no owner filter, and
there is no `/my` route. The owner filter lives in the search service and only this tool uses it,
with the credential's own id; the tool takes no user id or search text.

An administrator can edit a pending recommendation, and `updated_by_id` names only the last editor,
so an administrator's edit of one field outlives the submitter's edit of another. No field is known
to be the caller's own words, so every free-text field is sanitized, the title, topic title and
aliases as titles, and the Markdown, the proposed topic Markdown, the rejection reason and the
stored approval error also fenced as `external-content` from `topic_recommendation`. The approval
error is the message of whatever failed an approval, so it can quote an alias or slug an
administrator typed. The text the post carries beside the recommendation gets the same rule: the AI
summary, the rendered HTML and the clearance reason are fenced, and the names of the topics and
hashtags attached to the post and the image captions are sanitized as titles, because a topic name
or a hashtag is another user's text too. A test lists every string field of the documented post as
text or a validated format, so a field the post gains is text until it is classified. The nested
`created_by` and `updated_by` users get the `get_user` treatment: names sanitized, a bio fenced.
Identifiers, slugs, hostnames and URLs keep the formats the service validated. An empty title or Markdown stays an empty string, the
documented type. That text is for reading, not to send back to an update tool.

The posts are read from the primary database, not the entity cache, so an edit made a moment ago is
listed as edited. The ids come from a replica, as on REST, so a recommendation reviewed or withdrawn
a moment ago can still be selected there. The row just read decides: a post that no longer has the
requested `status` is dropped from the page, and the cursor, a position in the ranking, skips
nothing. A single recommendation is not truncated, as in `get_post`: one whose text exceeds half the
1 MiB result bound fails the call with the result-size error whatever the `limit`.

## Routes without a tool

Credentials, email addresses, sessions, API keys, OAuth applications and push subscriptions carry
secrets or sign-in state and have no read tool. `GET /api/v1/my/notifications/:id/redirect-target`
marks the notification read, so it is not a pure read and has none either.
