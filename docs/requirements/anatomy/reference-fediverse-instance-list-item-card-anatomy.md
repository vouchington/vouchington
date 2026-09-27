# Fediverse Instance Anatomy reference

[Back to Fediverse Instance Anatomy](fediverse-instance.md)

## List-Item / Card Anatomy

> `fediverse_instance` renders through the generic `TopicCard`
> (`web/components/topics/topic-card.tsx`) — the same shared component used by every topic type
> that isn't a bespoke surface (`card`, `rewards_program`, etc.), reached via `TopicList` →
> `TopicListPage` for `/instances`. Unlike `rss_feed`, it has no dedicated canonical component or
> `COMPONENTS.md` registry row; `/sources` is a fully separate bespoke page/component stack that
> predates `/instances`'s canonicalization onto the generic topic-list infrastructure and is not a
> pattern to mirror here. `TopicCard` gates a software row + trust badge on
> `topic.topic_type === 'fediverse_instance'`. The `/instances` loader and continuation fetch the
> dedicated public endpoint, then pass normalized instance attributes and hostname elections into
> the shared list. The trust badge therefore renders the hostname election when rated and the
> localized "Unrated" fallback otherwise. The software row renders the normalized software and
> version when classified, or the localized "Unclassified" fallback. The public projection omits
> raw NodeInfo and internal integration status; those fields remain internal/admin data. During a
> backend-first or web-first rolling deployment, the web reader sanitizes old endpoint responses
> and falls back to generic topic pagination when the old list contract cannot honor filters.

| Element       | Shows                                                                                                                     | Visible when             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Title         | Instance hostname, linked to its detail page                                                                              | Always                   |
| Software row  | NodeInfo-classified software + version (e.g. "Mastodon 4.2.1"), or "Unclassified" fallback                                | Always                   |
| Trust badge   | Hostname trust badge (color-coded) or "Unrated" fallback                                                                  | Always                   |
| Vote buttons  | Vouch / Disavow controls for the **fediverse_instance topic election** (generic topic vote, not the hostname trust badge) | Always                   |
| Follow button | Follow this instance                                                                                                      | Authenticated users only |

## Detail Anatomy

**Sidebar asides** (topic detail pages, in render order) — inherited from the generic
[topic detail layout](./topic.md#detail-anatomy):

1. About card — description + "Updated on … by …" line
2. Referral CTA — logged-out viewers with `?referrer=` param
3. Sources — hostname link
4. Actions — Mute (logged-in only)
5. Related topics
6. Communities
7. FAQ posts (accordion)
8. Admin tools — admin only; NodeInfo classification fields and integration-status history

The detail header also renders the public instance metadata panel: software/version, protocol,
total users, monthly active users, registration availability, and hostname trust. Swift and .NET
render the same normalized fields and trust tiers in native detail pages.
