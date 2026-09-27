# Domain Anatomy

> A web hostname with a community-assigned trust rating, surfaced on source cards, the domain
> directory, and the comparison page.

## See Also

- [Entity × Action Matrix — domain](../reference-domain.md#domain)
- [Sources & Domains requirements](../content/SOURCES-DOMAINS.md)

## Data Model

DB table: `url_hostnames`

| Field              | Notes                                                             |
| ------------------ | ----------------------------------------------------------------- |
| `id`               | UUID                                                              |
| `hostname`         | The hostname string (e.g. `example.com`)                          |
| `votes_score_net`  | Magnitude-weighted net semantic score (API-visible, not rendered) |
| `votes_count_up`   | Total positive semantic choices                                   |
| `votes_count_down` | Total negative semantic choices                                   |

## States

Trust badge is determined by vote counts — not a stored status column.

| Badge      | Color | Condition                                                 |
| ---------- | ----- | --------------------------------------------------------- |
| Trusted    | Green | `votes_score_net ≥ 3` AND `votes_count_up ≥ 5`            |
| Neutral    | Amber | Does not meet trusted or distrusted threshold             |
| Distrusted | Red   | `votes_score_net ≤ -3`                                    |
| Unrated    | Gray  | `votes_count_up + votes_count_down = 0` (no votes at all) |

## Surfaces

| Surface         | Route pattern                                  |
| --------------- | ---------------------------------------------- |
| Browse          | `/domains`                                     |
| Detail          | `/domain/:idOrHostname`                        |
| Comparison      | `/domains/compare?ids=id1,id2,...`             |
| Source list row | Trust badge embedded in source card bottom row |
| Home section    | "Most Trusted Domains" on home page            |

## List-Item / Card Anatomy

| Element      | Shows                                                        | Visible when      |
| ------------ | ------------------------------------------------------------ | ----------------- |
| Hostname     | Linked to domain detail page                                 | Always            |
| Trust badge  | Color-coded label (Trusted / Neutral / Distrusted / Unrated) | Always            |
| Vote counts  | Positive and negative semantic-choice totals                 | Always            |
| Vote buttons | Vouch / Disavow controls                                     | Signed-in viewers |

**In source list rows:** the trust badge (or "Unrated" fallback) links to the source topic's
`/reviews` page. A separate vote-button pair appears alongside it for authenticated users.

**Comparison page** (`/domains/compare`): up to 10 domains side-by-side, each showing hostname,
trust badge, and vote counts.

## Detail Anatomy

The domain detail page shows:

- Hostname and trust badge (prominent)
- Vote control (Vouch / Disavow) for signed-in viewers
- Related sources — RSS feeds whose homepage URL resolves to this hostname
- Vote history and stats

## Actions

| Action          | Who can act                                       |
| --------------- | ------------------------------------------------- |
| Vouch / Disavow | Signed-in viewers                                 |
| Compare domains | All viewers                                       |
| Report hostname | Signed-in viewers, unless the hostname is blocked |

Swift and .NET use the same `url_hostname` report target as web. A successful native submission
shows `Reported` for the current detail session.

## Related

- [source](./source.md) — sources whose homepage hostname is this domain
- [fediverse-instance](./fediverse-instance.md) — fediverse instances whose `hostname_id` is this domain; also uses this domain's trust badge as the hostname-vote
- [url](./url.md) — individual URLs under this domain
