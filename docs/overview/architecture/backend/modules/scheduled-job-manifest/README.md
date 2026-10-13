# Scheduled Job Manifest

Source entrypoint: [backend/modules/scheduled-job-manifest/README.md](../../../../../../backend/modules/scheduled-job-manifest/README.md)

This package owns the typed contract shared by recurring GlideMQ registration and operator
controls. Each `backend/queues/*/enqueues/schedules.mts` exports one manifest containing the queue
name and every scheduled job's scheduler ID, repeat rule, job template, environment gate, and one
or more operator surfaces. An empty `jobs` array is a tombstone, not a reason to delete the file.

`upsertScheduledJobManifest()` is the only production helper allowed to call GlideMQ's
`upsertJobScheduler()`, `getRepeatableJobs()`, and `removeJobScheduler()`. After the environment
filter, it upserts the desired set and then deletes any leftover schedulers on that queue so a
removed manifest entry (or a production-only job on staging) cannot keep firing from Valkey. If any
upsert fails, leftovers are left in place so a partial registration cannot wipe the live set. An
empty `jobs` array is a tombstone: it still lists extras and deletes them. Keep that empty
`schedules.mts` and its `SCHEDULE_DEFINITIONS` entry; deleting the file (or dropping the definition)
means no worker opens the queue to run this helper, so the last live scheduler remains in Valkey.
The API imports all queue manifests directly and `projectScheduledJobs()` derives the central
scheduled-job registry from surfaces with kind `scheduled-jobs`. Backfill, PostgreSQL admin, and
Valkey Bloom controls remain on their existing domain routes but are declared in the same manifest
so a scheduled job cannot be operator-orphaned.

`validateScheduledJobManifests()` rejects duplicate scheduler identities, duplicate central
scheduled-job IDs, blank metadata, and empty operator-surface lists. The API catalog test pins the
complete 26-manifest, 54-job runtime set, exact templates, registration ordering, environment gates,
and parity with the live operator registries. The repository reachability guard separately proves
that every manifest is imported by the API catalog and a runtime schedule entrypoint.
Runtime-derived values are represented as factories so repeated registration observes current time
and configuration.

## Global 1-minute scheduling floor

No scheduled job may repeat faster than every 60 seconds (`SCHEDULING_FLOOR_MS` in
`validation.mts`) unless the job definition sets `subMinuteJustification`. `validateScheduledJobRepeat`
is the single enforcement point: it is called both statically, from `validateScheduledJobManifests`
for literal `repeat` objects, and from `runtime.mts`'s `register()` on the **resolved** value for
every job (literal or thunk), so a thunk that resolves to a sub-minute cadence is caught even though
it bypasses static validation. The justification is optional in the TypeScript type — the
requirement is enforced by this runtime throw, not by `tsgo`, because only this seam sees a resolved
thunk value. A missing justification surfaces as a manifest-validation error at worker boot or in
the static manifest test, not as a compile error. No job is justified today.

A `pattern` repeat must be exactly 5 fields. GlideMQ's cron evaluator only ever parses 5
whitespace-separated fields (`nextCronOccurrenceUtc`/`nextCronOccurrenceTz` in `glide-mq`'s
`src/utils.ts`) and throws on any other count, with no seconds-precision support — so a 6-field
pattern is rejected here, at manifest-definition time, with a scheduler-key-attributed message
instead of failing later and less legibly inside GlideMQ.

## Staging hourly floor

Staging's Aurora Serverless v2 cluster can only auto-pause to 0 ACU after a contiguous 300 s idle
window, and every resume is a separate wake. A scheduled job firing more than once an hour keeps the
cluster awake around the clock, and jobs that each keep their own minute (an `every` schedule keeps
the phase of its first upsert; `17 * * * *` pins minute 17) wake it once per distinct minute.
`upsertScheduledJobManifest()` and `projectScheduledJobs()` both accept an `applyHourlyFloor`
option, defaulting to `getDeployEnvironment(options.env) === 'staging'` (`@ts-shared/deploy-environment`,
never raw `NODE_ENV` — ECS hardcodes `NODE_ENV=production` on every deployed environment, staging
included). Production always resolves `applyHourlyFloor` to `false` by construction, and
`environment: 'production'`-flagged jobs are never aligned even if it were `true` (defense in
depth — see `register()` in `runtime.mts`).

There are no exceptions: every job that is not `environment: 'production'` fires at most once an
hour on staging, and only at minute :00 UTC, so all jobs share one wake per hour. The manifest has
no per-job opt-out. A job whose production cadence is faster than hourly (for example the
five-minute ActivityPub inbox cleanup) therefore runs hourly on staging; production keeps its
declared cadence.

### Alignment rule

`hourly-clamp.mts` rewrites the **resolved** repeat to a cron `pattern` whose minute field is `0`:

| Declared repeat                              | Registered on staging                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `{ every }` of one hour or less              | `0 * * * *`                                                                    |
| `{ every }` of 2, 3, 4, 6, 8, 12 or 24 hours | `0 */N * * *` (`0 0 * * *` for 24 hours)                                       |
| Any other `{ every }` up to 24 hours         | The next listed step up, so it never fires more often (5 hours: `0 */6 * * *`) |
| `{ every }` over 24 hours, up to 7 days      | `0 0 * * 0` (weekly)                                                           |
| `{ every }` over 7 days                      | `0 0 1 * *` (monthly, the least frequent rung)                                 |
| `{ pattern }` with minute field `0`          | Unchanged (same object)                                                        |
| Any other `{ pattern }`                      | Same pattern with the minute field replaced by `0`                             |

A cron keeps its hour, day-of-month, month and day-of-week fields, so `30 2 * * *` becomes
`0 2 * * *`, `17 * * * *` and `*/5 * * * *` both become `0 * * * *`, and `*/10 9-17 * * 1-5`
becomes `0 9-17 * * 1-5`. An interval that does not divide 24 hours rounds up rather than down, and
an interval over a month is capped at monthly, so no job runs more often than it declares except in
that last case (no manifest job has one). `every` loses its phase on purpose: a fixed phase is what
spread the wakes across minutes. Production minute offsets that staggered daily and weekly jobs (for
example the 02:30 tier-1 crawl dispatcher) collapse onto :00 on staging. A malformed minute field
such as `61 * * * *` or `*/0 * * * *` is rejected before it is rewritten, so staging fails the same
manifests production does.

`runtime.mts` aligns the **resolved** value of a thunk repeat on every call, matching the same seam
the 1-minute floor's justification check uses above. `projection.mts` deliberately does not resolve
thunk-typed repeats for its dashboard `operatorSurfaces[].schedule` text, since that surface only
renders literal repeats today; for a literal repeat that was rewritten it shows the registered
cadence (`every 1h`, `every Nh`, or the aligned cron) instead of the manifest's production text.

### Moving existing schedulers

No remove-and-re-add step is needed when a deploy changes a staging scheduler's repeat. In
glide-mq 0.17.0, `Queue.upsertJobScheduler()` (`dist/queue.js`, `upsertJobScheduler`) keeps the
stored `nextRun`, `lastRun` and `iterationCount` only when the pattern, `every`,
`repeatAfterComplete`, time zone and bounds are all identical to the stored entry. Any difference
takes the `computeInitialSchedulerNextRun()` result (`dist/utils.js`) instead: the next cron
occurrence after now for a `pattern`. The scheduler tick fires entries from the stored `nextRun`
(no delayed job is pre-enqueued), so an `every` or off-minute scheduler moves to the next :00 the
first time a deploy registers its aligned cron, and an already-aligned cron keeps its stored
`nextRun`.

### Follow-on work

The alignment moves when a scheduled job _starts_. A trampoline job (one whose only work is to
enqueue a dispatcher: `enqueueUnfurlReferralLinksDispatcher`, `enqueueReconcileEntities`, the crawl
hostname and tier dispatchers) starts at :00 and its follow-on jobs are enqueued immediately, with no
delay other than the short exponential retry `backoff` (5 s base, 3 attempts). The unfurl and entity
reconciliation dispatchers are retained sweeps (`processRetainedSweep()`): a pass that reports
`hasMore` re-queues itself with `moveToDelayed(Date.now())`, so a backlog keeps draining back to back
in one extended wake (up to 20,000 rows per pass for unfurl and 10,000 for reconciliation, at the
default limits) instead of waiting for the next :00. A large backlog can therefore keep staging
awake longer than 300 s after :00, but it extends that hour's wake rather than adding a wake at
another minute.

## Related

- [Backend queue checklist](../../../../../checklists/backend-queues.md)
- [Message Queue API](../../../../../requirements/api/v1/mq/README.md)
- [Worker queue inventory](../worker-queue-inventory/README.md)
