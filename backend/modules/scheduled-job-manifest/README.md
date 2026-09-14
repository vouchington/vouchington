# Scheduled Job Manifest

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
window; a scheduled job firing more than once an hour is enough to keep it awake around the clock.
`upsertScheduledJobManifest()` and `projectScheduledJobs()` both accept an `applyHourlyFloor`
option, defaulting to `getDeployEnvironment(options.env) === 'staging'` (`@ts-shared/deploy-environment`,
never raw `NODE_ENV` — ECS hardcodes `NODE_ENV=production` on every deployed environment, staging
included). Production always resolves `applyHourlyFloor` to `false` by construction, and
`environment: 'production'`-flagged jobs are never clamped even if it were `true` (defense in
depth — see `register()` in `runtime.mts`).

The clamp (`hourly-clamp.mts`) is a **floor, not a target**: only repeats already firing more than
once per hour are rewritten. `{ every: n }` becomes `{ every: Math.max(n, 3_600_000) }`; a cron
`pattern` whose minute-field cardinality implies more than one firing per hour is rewritten to
`'0 * * * *'` (clamped patterns intentionally cluster at the top of the hour — one contiguous idle
window beats jobs spread evenly across it). Already-compliant repeats are returned byte-identical
(same reference), not merely equal, so unaffected jobs don't get spurious reschedules.
`runtime.mts` clamps the **resolved** value of a thunk repeat on every call, matching the same
seam the 1-minute floor's justification check uses above; `projection.mts` deliberately does not
resolve thunk-typed repeats for its dashboard `operatorSurfaces[].schedule` text, since that surface
only renders literal repeats today.

## Related

- [Backend queue checklist](../../../docs/checklists/backend-queues.md)
- [Message Queue API](../../api/v1/mq/README.md)
- [Worker queue inventory](../worker-queue-inventory/README.md)
