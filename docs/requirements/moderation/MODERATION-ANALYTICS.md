# Moderation Analytics

## Overview

Moderation analytics gives site admins and community moderation teams a read-only dashboard for queue health, automod quality, human workload, appeal outcomes, and first-post friction.

Because this capability is intentionally read-only, native rendering and loading of the same
metrics constitutes full parity. It does not establish action parity for reports, appeals,
disputes, review queues, or integrity queues; see the
[Client Parity Matrix](../CLIENT-PARITY-MATRIX.md).

## Surfaces

| Surface                   | Route                                                                 | Audience                                                                                                          |
| ------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Global admin              | `/admin/moderation-analytics`                                         | Administrators                                                                                                    |
| Community analytics       | `/communities/:slug/settings/moderation/analytics`                    | Community owners, moderators, admins                                                                              |
| Global API                | `GET /api/v1/admin/moderation-analytics?range=30d`                    | Administrators                                                                                                    |
| Community API             | `GET /api/v1/communities/:idOrSlug/moderation-analytics`              | Community modlog-authorized moderators                                                                            |
| Paid transparency         | `GET /api/v1/moderation-transparency?range=30d`                       | Administrators and active/past-due Plus or Pro members                                                            |
| Community AI transparency | `GET /api/v1/communities/:idOrSlug/moderation-transparency?range=30d` | Community owners/moderators and administrators at any tier; active/past-due Plus or Pro members of that community |

## Date Ranges

Supported ranges are `today`, `7d`, `30d`, `90d`, and `all`. Missing or invalid values fall back to `30d`. Raw admin and community analytics use exact rolling durations for `7d`, `30d`, and `90d`; `today` begins at the UTC day boundary. For paid transparency, each range ends at the final millisecond of the complete UTC day before the 48-hour release cutoff; every shorter range begins at a UTC day boundary so the first bucket is a complete daily cohort. `today` is the latest complete calendar-day cohort rather than the current still-delayed day.

## Metrics

- Queue volume: report totals, pending report count, report trend, clearance action trend, and moderator action trend.
- Rule violation trends: report reasons ranked by volume and grouped over time.
- Automod performance: agent moderation, OpenAI omni, spam detection, community prompt sources, auto-removes, reviewed count, false positives, false-positive rate, and confidence distribution.
- Moderator workload: top moderators by action count with per-action breakdowns.
- Appeal success rate: closed appeals, accepted/reduced/denied/dismissed counts, and success rate.
- New-user friction: first posts in the selected scope, rejected first posts, and rejection rate.

## Implementation

Raw analytics page data is aggregated directly from operational tables in `@services/moderation-analytics`. Paid transparency instead promotes qualifying daily candidates into an immutable aggregate-only release projection before reading it; a released cohort therefore survives source and community hard deletion. Community scope is stamped at source-event time, and all scoped reports, actions, automated moderation, clearance changes, and appeals are excluded from the global projection. All-time continuation eligibility reads the same immutable release projection instead of probing unbounded operational history. The pre-launch migration rejects a non-empty source database; clean bootstrap installs the projections before application writes.

Hard deletes aggregate their `OLD TABLE` transition rows by immutable UTC day, scope, metric, and category before decrementing rollups. The canonical cohort order and an exclusive deletion barrier prevent cascade row locks from interleaving advisory-lock acquisition; positive ingestion takes the corresponding shared barrier.

## Paid Transparency Release Boundary

Paid transparency is a separate aggregate-only projection. Both its global and community-AI
endpoints use one release boundary: a 48-hour delay, suppression of each metric/category/day
cohort below 20, and rounding of every released count to the nearest five. They return no user
identities, reporter details, community identifiers, prompt text, raw AI output/reasoning, or raw
records. Active and `past_due` Plus/Pro memberships retain access only while `expires_at` is absent
or in the future; a still-`active` `cancel_at_period_end` membership retains access until that
boundary, while Free, paused, cancelled, expired, and otherwise terminal memberships are denied. The existing global-admin and
community analytics endpoints retain their staff-scoped raw operational views and do not use this
projection.

The delay is applied to complete UTC daily cohorts: the release boundary is the final millisecond
of the UTC day immediately before the 48-hour cutoff. A day that contains the cutoff is withheld
in full, even when some of its events are already 48 hours old, so a later release cannot reveal
the complement of a previously rounded cohort.

The global transparency endpoint can return the four aggregate metric families: reports, appeals,
moderation actions, and platform automated moderation. Every event stamped with a community scope,
including a platform agent's moderation of a community post, is excluded so comparing the global
and community projections cannot reveal a suppressed complement. The community transparency
endpoint is deliberately narrower and returns only community-scoped automated-moderation outcomes;
`community_ai` continues to identify activity from a community agent prompt.
Clearance-rejection categories are stamped into the append-only clearance event at transition time,
as an immutable, ordered multi-source projection: a jointly flagged rejection contributes once to
each of the OpenAI and spam cohorts, never to the generic system-rejection cohort. Later changes to
a post's OpenAI or spam flags cannot alter or duplicate released analytics.
Report-reason cohorts likewise use the immutable reason recorded at report creation, so editing a
pending report cannot rewrite a released cohort or use its older creation time to bypass the delay.
`all` retains the same aggregate response shape but coarsens dates to calendar months and is served
as fixed 12-month UTC pages, newest month first. Its first response uses the complete-day release
boundary as its upper bound; only an older daily cohort that independently passes the release boundary can cause it
to return an opaque `next_cursor`, which clients send as
`after` with `range=all` to request the next older page. The cursor is bound to the global or
specific community projection and cannot be reused across either. Shorter ranges retain daily
buckets in chronological order and never return a cursor. Fixed page data scans are bounded to 12
months without misrepresenting a capped window as all-time data. The continuation-eligibility probe
may inspect older history so a releasable page beyond sparse months remains reachable, but it
materializes at most one released daily cohort; a persisted released-daily-rollup projection is the
used for the bounded continuation check. All-time month totals are derived only after
each underlying UTC day has independently passed the 48-hour delay, cohort-of-20 suppression, and
nearest-five rounding; private daily cohorts never combine to become releasable in a month.

The release boundary accepts only safe integer counts. SQL `COUNT(*)` aggregates satisfy that
contract; fractional, non-finite, negative, and unsafe values fail closed rather than being
rounded. Nearest-five rounding therefore applies only to integer aggregates.

## Related

- [Moderation Flows](./MODERATION-FLOWS.md)
- [Post Moderation](./POST-MODERATION.md)
- [Moderation Appeals](./MODERATION-APPEALS.md)
- [Modlog](./MODLOG.md)
