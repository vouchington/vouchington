# Profile, Notification, and Preference Write Tools

Eleven MCP-only tools change the caller's own profile, notifications, and preferences. Each runs the
same shared service command as its REST twin, so validation, ownership, and domain rules do not
fork. They require `plan: 'plus'` and a full resource pair: `profile:read` + `profile:write`,
`notifications:read` + `notifications:write`, or `preferences:read` + `preferences:write`. A
read-only grant never satisfies the write scope, and `mcp.user:read` with `mcp.user:write` covers all
three resources, since none of them is an exact grant. The
existing per-call MCP audit records every call; there is no separate audit path. The generated
[tool catalog](catalog.md) holds each tool's description, hints, and scopes; the
[agent tools overview](README.md) covers metadata and plan gating.

| Tool                          | REST twin                                | Notes                                                                                     |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `update_my_bio`               | `PATCH /api/v1/my/profile`               | Replaces the whole bio; an empty string clears it                                         |
| `add_my_profile_link`         | `POST /api/v1/my/profile/links`          | `link_type` is required; a profile holds at most 20 links                                 |
| `update_my_profile_link`      | `PATCH /api/v1/my/profile/links/:id`     | Omitted fields are kept; a null `url`, `handle`, or `name` clears it                      |
| `delete_my_profile_link`      | `DELETE /api/v1/my/profile/links/:id`    | Deleting a deleted link is not found                                                      |
| `reorder_my_profile_links`    | `PUT /api/v1/my/profile/links/order`     | `ids` is every link exactly once; idempotent                                              |
| `update_my_display_identity`  | `PATCH /api/v1/my/identity`              | `use_display_name_from` and `profile_image_id` only                                       |
| `mark_notification_read`      | `PATCH /api/v1/my/notifications/:id`     | Marking a read notification changes nothing                                               |
| `mark_all_notifications_read` | `POST /api/v1/my/notifications/read-all` | Returns how many notifications changed                                                    |
| `delete_notification`         | `DELETE /api/v1/my/notifications/:id`    | Queues the deletion the route queues; repeating it before the worker runs reports success |
| `update_my_email_preferences` | `PATCH /api/v1/my/email-preferences`     | The eight email fields; a null time zone is invalid here                                  |
| `update_my_preferences`       | `PATCH /api/v1/users/:idOrSlug`          | Visibility, messaging, post defaults, country, locale, and Hacker News discussions only   |

`update_my_preferences` always targets the caller and sends only an allow-listed subset of the route's
body to the same `updateUser` command. The tool schema rejects every other field, so a delegated
credential cannot reach the username, consents, federation, or financial-data visibility through it.

## No tool

These stay REST-only. Anything a leaked delegated credential could use to take over, lock out, or
destroy an account, or to change its legal or credential state, is excluded by default.
`update_my_preferences` is the exception in spirit: it can loosen follower, like, and message
visibility and the default post privacy, exactly as the web can, so a key with `mcp.user:write`
or the `preferences` grants can change what the account shows others.

| REST write                                                        | Reason                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Username change (`PATCH /api/v1/my/identity`, `username`)         | Changes the account's public address and its links                                         |
| Passwords, email addresses, two-factor, sign-in methods, sessions | Credentials and account recovery                                                           |
| API keys, OAuth apps, and connected-app grants                    | They mint or revoke other credentials; owned by the API key and OAuth work                 |
| Account deletion, billing, and plan changes                       | Destructive or financial, and not recoverable by the user                                  |
| Consents, processing restriction, third-party marketing           | Legal records the user must give through a first-party flow                                |
| Financial-data visibility (cards, rewards statuses, spending)     | Exact-grant data; `update_my_preferences` rejects these fields                             |
| Federation and identity verification                              | Publish the account elsewhere or prove who the user is                                     |
| Push subscriptions                                                | Bound to one device                                                                        |
| Aside preferences and landing pages                               | Presentation state of the web app, outside the profile, notification, and preference tools |

Support and CRM surfaces are never tools.

## Design notes

- **Avatars and links.** `update_my_display_identity` takes an existing image id and applies the
  route's ownership check, so another user's image is refused. The link tools omit `image_id`: MCP
  has no image upload, so a link image could not be attached from a tool.
- **Result shapes.** `update_my_bio` returns the bio it wrote. The identity tool returns only
  `use_display_name_from` and `profile_image_id`, and the preferences tool returns each setting it
  can change, read back from the primary. The output schemas reuse the documented REST components,
  and `profile-notification-output-schema.test.mts` pins each field to the documented response.
- **Collections.** A profile holds at most 20 links, so `reorder_my_profile_links` returns the whole
  ordered list under `results`, as the route does, with no cursor or limit.
- **Partial updates.** `update_my_display_identity` applies the display-name source and then the
  avatar, in the route's order. A refused avatar after a changed display-name source leaves the
  source changed, exactly as the route does.
- **Suspension.** Every tool rejects a suspended caller before any change. The REST routes behind
  the profile, profile-link, notification, and email-preference tools do not check suspension yet,
  so those tools are stricter than their twins until [#1762](https://github.com/vouchington/vouchington/issues/1762)
  closes the gap.
- **Reads.** The write tools need `notifications:read` and `preferences:read`; the
  [own-data read tools](own-data-read-tools.md) read the caller's bio, links, notifications, and
  settings back under those scopes.
- **Scope coupling.** `profile:write` requires `profile:read`, which also authorizes
  `get_my_profile`. Granting profile writes therefore also grants reading that profile.
- **Ownership.** Notification and link tools act only on rows the caller owns; another user's id
  is reported as not found, indistinguishable from a missing one.
