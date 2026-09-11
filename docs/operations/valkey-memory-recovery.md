# Valkey Memory Pressure — Diagnosis & Recovery Runbook

Runbook for diagnosing ElastiCache Valkey memory pressure and recovering by flushing a scoped
concern (caches, recently-viewed, blooms, rate-limiter, dynamic-config, sessions, queues) or
rebuilding a bloom filter, without a blunt `FLUSHDB`.

## Scope

- Affected service or feature: ElastiCache Valkey (single shared instance backing sessions,
  entity caches, rate limiter, dynamic config, and GlideMQ queues — see
  [infrastructure.md § Valkey Strategy](../overview/infrastructure/infrastructure.md)).
- Environments: staging, production.
- Operator role or permission needed: a Voucha **admin** account for the preferred recovery path.
  The secondary ECS path requires a separately controlled break-glass AWS profile; ordinary
  developer and OpenTofu profiles do not have enough authority.
- Out of scope: provisioning or resizing the ElastiCache instance itself (see
  [`vouchington-infra` OpenTofu checklist](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/HUMAN_CHECKLIST.md)); editing
  `backend/services/bloom-filter` / `email-bloom-filter` source (this doc only operates the
  already-shipped admin surfaces, it does not change bloom filter sizing/growth logic).

## Source Of Truth

- Implementation: [`backend/services/valkey-admin/flush.mts`](../../backend/services/valkey-admin/flush.mts),
  [`backend/api/v1/valkey/queues-flush.mts`](../../backend/api/v1/valkey/queues-flush.mts),
  [`backend/api/v1/valkey/index.mts`](../../backend/api/v1/valkey/index.mts)
- Web admin UI: [`web/app/admin/valkey/page.tsx`](../../web/app/admin/valkey/page.tsx) (Flush
  Concerns card, Bloom Filter Rebuild card, Cache Management card), gated by `requireAdmin()` in
  the route's `layout.tsx`
- Deployed command: [`backend/entrypoints/api/valkey-admin.mts`](../../backend/entrypoints/api/valkey-admin.mts)
- Audited launcher: [`vouchington-infra` Valkey task launcher](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/scripts/run-valkey-admin-task.sh)
- Infrastructure: [`vouchington-infra` Valkey resources](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/valkey.tf) (ElastiCache replication group,
  `valkey_url` SSM parameter), `vouchington-infra/opentofu/monitoring.tf` (CloudWatch alarms, including
  `valkey-memory-high`), and
  [`vouchington-infra` Valkey admin locks](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/global/valkey-admin-locks.tf) (atomic
  environment-scoped flush admission)
- Related docs: [`backend/services/valkey-admin/README.md`](../../backend/services/valkey-admin/README.md),
  [`backend/api/v1/valkey/README.md`](../../backend/api/v1/valkey/README.md)

## Prerequisites

- Required local tools: AWS CLI v2; `curl` only for the HTTP API; `jq` for the ECS launcher.
- Required cloud access: `cloudwatch:GetMetricStatistics` (or `GetMetricData`) scoped to the
  target ElastiCache replication group for the read-only metric path; the ECS break-glass path
  additionally requires the exact permissions below.
- Required secrets or environment variables: no application secret is passed to the launcher.
  Admin recovery uses a web session or bearer token; ECS recovery uses the explicitly named AWS
  profile and the task definition's existing secret bindings.
- Preflight checks: confirm which environment is affected (staging vs production) and its
  replication group id, `voucha-<environment>-valkey` (the sole cache cluster in that group is
  `voucha-<environment>-valkey-001`, per `vouchington-infra/opentofu/valkey.tf`'s `num_cache_clusters = 1`)

The ECS launcher requires `sts:GetCallerIdentity`; ECS `DescribeServices`,
`DescribeTaskDefinition`, `RunTask`, `DescribeTasks`, `ListTasks`, and `StopTask`; CloudWatch Logs
`DescribeLogStreams` and `GetLogEvents`; DynamoDB `GetItem`, `PutItem`, and `DeleteItem` on
`arn:aws:dynamodb:us-west-2:<account-id>:table/voucha-valkey-admin-locks`; and `iam:PassRole` for
the exact ECS execution and API task roles, conditioned on
`iam:PassedToService = ecs-tasks.amazonaws.com`. `RunTask` plus `PassRole` permits arbitrary
execution inside the secret-bearing API task. A profile name is not proof of authority: AWS
authorization is authoritative, and OpenTofu does not grant this human break-glass access.

## Procedure

### Diagnose

1. Check freeable memory and eviction pressure directly via CloudWatch — this works with
   read-only AWS creds and needs no VPC connectivity, ECS access, or shell into any container:

   ```bash
   ENVIRONMENT=staging   # or production
   CACHE_CLUSTER_ID="voucha-${ENVIRONMENT}-valkey-001"

   aws cloudwatch get-metric-statistics \
     --namespace AWS/ElastiCache \
     --metric-name FreeableMemory \
     --dimensions Name=CacheClusterId,Value="$CACHE_CLUSTER_ID" \
     --start-time "$(date -u -v-3H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '-3 hours' +%Y-%m-%dT%H:%M:%S)" \
     --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
     --period 300 \
     --statistics Average Minimum \
     --output table
   ```

   Also pull `DatabaseMemoryUsagePercentage` (Valkey 8's built-in percent-used metric) the same
   way. Pull `Evictions` too — the parameter group's `maxmemory-policy` is `noeviction`
   (`vouchington-infra/opentofu/valkey.tf`), so **any non-zero `Evictions` value means writes are already being
   rejected**, not silently evicted — treat that as an immediate page, not a trend to watch.

2. Check the `valkey-memory-high` CloudWatch alarm's history and the SNS topic
   (`cloudwatch_alarms_topic_arn` output) first instead of running the query above by hand.

3. If the admin surface is unavailable or concern-level evidence is required, use a single
   operator and the break-glass launcher with an explicitly selected profile:

   ```bash
   vouchington-infra/opentofu/scripts/run-valkey-admin-task.sh staging --profile voucha-break-glass diagnose
   ```

   The launcher prints the AWS account/caller, exact live service task definition, image, roles,
   task ARN, image digest, and CloudWatch log locator. The schema-version 1 result contains curated
   memory fields and `observedFlushTargetKeyCounts` for all seven concerns plus `unclassified`.
   Counts are non-atomic SCAN observations: concurrent writes can cause drift or duplicate
   observations, and counts are not memory attribution. No key names or raw Valkey output appear.

### Recover

The lowest-friction path needs **no AWS access at all** — only a Voucha admin account:

1. Log in as an admin user on the affected environment and open `/admin/valkey`
   (`https://staging.voucha.ai/admin/valkey` or the production equivalent). The page requires
   `requireAdmin()`; non-admins are redirected.
2. **Bloom Filter Rebuild card** — pick the affected filter
   (`url-blocklist` | `email-blocklist` | `embedding` | `entity-cache` | `api-keys`) and trigger a
   rebuild. This enqueues an async rebuild job; it does not itself free memory until the rebuild
   replaces the old filter.
3. **Flush Concerns card** — pick the scoped concern to flush
   (`caches` | `recently-viewed` | `blooms` | `rate-limiter` | `dynamic-config` | `sessions` |
   `queues`) and confirm. `sessions` requires an extra force-confirm since it logs out every user
   and invalidates in-flight passkey/MFA/OAuth challenges — only use it if session key growth is
   the confirmed cause.

Equivalent HTTP API calls, if scripting instead of using the UI (still admin-session-authenticated,
still no AWS access):

```bash
# Requires an authenticated admin session cookie/bearer token for the target environment.
curl -sS -X POST "https://staging.voucha.ai/api/v1/valkey/flush" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ADMIN_BEARER_TOKEN" \
  -d '{"concern": "blooms"}'

curl -sS -X POST "https://staging.voucha.ai/api/v1/valkey/bloom-filters/rebuild" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $ADMIN_BEARER_TOKEN" \
  -d '{"filter": "url-blocklist"}'
```

`concern: "sessions"` needs `{"concern": "sessions", "force": true}` or it 400s. An unrecognized
`concern` also 400s. See
[`backend/api/v1/valkey/README.md`](../../backend/api/v1/valkey/README.md) for the full request/
response contract.

If the admin UI/API is unavailable, the same scoped operation can run through the pinned live API
task definition. Always diagnose first, copy the exact environment-bound confirmation, and keep one
operator responsible for the full attempt:

```bash
vouchington-infra/opentofu/scripts/run-valkey-admin-task.sh staging --profile voucha-break-glass \
  flush blooms --confirm "FLUSH staging VALKEY blooms"

vouchington-infra/opentofu/scripts/run-valkey-admin-task.sh staging --profile voucha-break-glass \
  flush sessions --confirm "FLUSH staging VALKEY sessions" --force
```

The tested launcher interface accepts no image, task definition, role, cluster, or network
override. It resolves and revalidates the current backend service launch inputs, blocks flush
during a deployment rollout, atomically admits only one flush per environment through the
`voucha-valkey-admin-locks` DynamoDB lock table, and refuses an already-active launcher task. The
launcher releases only its own lock after the exact ECS task is confirmed stopped with exit `0` and
its complete image-digest, log-stream, and schema-version 1 result evidence is validated. If task
outcome, cleanup, or evidence is uncertain, it retains the lock indefinitely. Diagnosis does not
take this destructive-operation lock and remains available during rollout or an unhealthy service
because it does not mutate Valkey.

There is no automatic expiry or takeover. Before manually removing a retained lock, first prove
the original launcher process is terminated, then use a strongly consistent DynamoDB `GetItem` to
record its `owner_token`, `caller_arn`, and `acquired_at`. Audit both RUNNING and recently STOPPED
ECS candidates with `ListTasks`, exact-match the invocation-unique `startedBy` value through
`DescribeTasks`, and inspect any matching stopped task's CloudWatch logs. Remove the item only when
no task can still be running and the stopped-task result has been reviewed, using a conditional
`DeleteItem` that requires the recorded `owner_token`; never delete it unconditionally. Preserve
that audit with the incident record before starting another flush.

Use the same explicit profile and region throughout the audit. On the original operator host,
terminate the launcher and wait for its process to exit before continuing. If its termination
cannot be proved, stop: do not remove the lock. Then inspect the persistent item and ECS:

```bash
ENVIRONMENT=staging
PROFILE=voucha-break-glass
LOCK_KEY="{\"environment\":{\"S\":\"$ENVIRONMENT\"}}"

LOCK_ITEM=$(aws --profile "$PROFILE" --region us-west-2 dynamodb get-item \
  --table-name voucha-valkey-admin-locks --key "$LOCK_KEY" --consistent-read --output json)
printf '%s\n' "$LOCK_ITEM"
OWNER_TOKEN=$(printf '%s' "$LOCK_ITEM" | jq -er '.Item.owner_token.S') || {
  printf 'The persistent lock has no owner_token; stop for manual investigation.\n' >&2
  exit 1
}

describe_owner_tasks() {
  DESIRED_STATUS="$1"
  LIST_RESPONSE=$(aws --profile "$PROFILE" --region us-west-2 ecs list-tasks \
    --cluster "voucha-$ENVIRONMENT-cluster" \
    --desired-status "$DESIRED_STATUS" \
    --output json) || return 1
  printf '%s' "$LIST_RESPONSE" | jq -e '.taskArns | type == "array"' >/dev/null || return 1

  MATCHES='[]'
  while IFS= read -r CANDIDATE_ARN; do
    [ -n "$CANDIDATE_ARN" ] || continue
    DESCRIBED=$(aws --profile "$PROFILE" --region us-west-2 ecs describe-tasks \
      --cluster "voucha-$ENVIRONMENT-cluster" \
      --tasks "$CANDIDATE_ARN" \
      --output json) || return 1
    MATCH=$(printf '%s' "$DESCRIBED" | jq -ec --arg owner "$OWNER_TOKEN" '
      select((.failures | length) == 0 and (.tasks | length) == 1) |
      [.tasks[0] | select(.startedBy == $owner)]
    ') || return 1
    MATCHES=$(jq -cn --argjson matches "$MATCHES" --argjson match "$MATCH" \
      '$matches + $match') || return 1
  done <<EOF
$(printf '%s' "$LIST_RESPONSE" | jq -r '.taskArns[]')
EOF
  printf '%s' "$MATCHES"
}

OBSERVED_STOPPED_TASKS='[]'
for DELAY_SECONDS in 0 1 2 4 8 16 32 64 64 64 45; do
  if [ "$DELAY_SECONDS" -gt 0 ]; then sleep "$DELAY_SECONDS"; fi
  RUNNING_MATCHES=$(describe_owner_tasks RUNNING) || {
    printf 'Could not audit RUNNING ECS tasks; keep the lock.\n' >&2
    exit 1
  }
  STOPPED_MATCHES=$(describe_owner_tasks STOPPED) || {
    printf 'Could not audit STOPPED ECS tasks; keep the lock.\n' >&2
    exit 1
  }
  OBSERVED_MATCHES=$(jq -cn --argjson running "$RUNNING_MATCHES" \
    --argjson stopped "$STOPPED_MATCHES" '
      reduce ($running + $stopped)[] as $task ({}; .[$task.taskArn] = $task) | [.[]]
    ')
  ACTIVE_MATCHES=$(printf '%s' "$OBSERVED_MATCHES" | jq -c \
    '[.[] | select(.lastStatus != "STOPPED")]')
  if [ "$ACTIVE_MATCHES" != '[]' ]; then
    printf 'The lock owner still has an active ECS task: %s\n' "$ACTIVE_MATCHES" >&2
    exit 1
  fi
  STOPPED_MATCHES=$(printf '%s' "$OBSERVED_MATCHES" | jq -c \
    '[.[] | select(.lastStatus == "STOPPED")]')
  OBSERVED_STOPPED_TASKS=$(jq -cn --argjson observed "$OBSERVED_STOPPED_TASKS" \
    --argjson stopped "$STOPPED_MATCHES" '
      reduce ($observed + $stopped)[] as $task ({}; .[$task.taskArn] = $task) | [.[]]
    ')
done

STOPPED_COUNT=$(printf '%s' "$OBSERVED_STOPPED_TASKS" | jq -r 'length')
if [ "$STOPPED_COUNT" -ne 1 ]; then
  printf 'Exactly one stopped task must match the lock owner; keep the lock.\n' >&2
  exit 1
fi
STOPPED_SUMMARY=$(printf '%s' "$OBSERVED_STOPPED_TASKS" | jq -ec '
  .[0] as $task |
  [$task.containers[]? | select(.name == "backend")] as $containers |
  select(($containers | length) == 1) |
  {
    taskArn: $task.taskArn,
    taskDefinitionArn: $task.taskDefinitionArn,
    stoppedReason: $task.stoppedReason,
    exitCode: $containers[0].exitCode,
    logStreamName: $containers[0].logStreamName
  } |
  select(.logStreamName | type == "string" and length > 0)
') || {
  printf 'Stopped-task evidence was incomplete; keep the lock.\n' >&2
  exit 1
}
printf 'Stopped task: %s\n' "$STOPPED_SUMMARY"
LOG_STREAM=$(printf '%s' "$STOPPED_SUMMARY" | jq -r '.logStreamName')
LOG_EVENTS=$(aws --profile "$PROFILE" --region us-west-2 logs get-log-events \
  --log-group-name "/voucha/$ENVIRONMENT/backend" \
  --log-stream-name "$LOG_STREAM" \
  --start-from-head \
  --output json) || {
  printf 'Could not retrieve the stopped task logs; keep the lock.\n' >&2
  exit 1
}
printf '%s' "$LOG_EVENTS" | jq -e '.events | type == "array"' >/dev/null || {
  printf 'The stopped task log response was malformed; keep the lock.\n' >&2
  exit 1
}
VALIDATED_RESULT=$(printf '%s' "$LOG_EVENTS" | jq -ec --arg environment "$ENVIRONMENT" '
  def nonnegative_integer: type == "number" and floor == . and . >= 0;
  [
    .events[]?.message | fromjson? | select(
      type == "object" and
      .schemaVersion == 1 and
      .operation == "flush" and
      .environment == $environment and
      (.timestamp | type == "string" and length > 0) and
      (.concern | IN(
        "caches",
        "recently-viewed",
        "blooms",
        "rate-limiter",
        "dynamic-config",
        "sessions",
        "queues"
      )) and
      has("keysRemoved") and
      (.keysRemoved == null or (.keysRemoved | nonnegative_integer))
    )
  ] | if length == 1 then .[0] else empty end
') || {
  printf 'The stopped task did not have exactly one valid flush result; keep the lock.\n' >&2
  exit 1
}
printf 'Validated flush result: %s\n' "$VALIDATED_RESULT"
```

ECS state is eventually consistent, so a single empty `ListTasks` response is insufficient. ECS
also forbids combining `startedBy` with another task filter, which is why the recipe lists RUNNING
and STOPPED candidates separately and exact-filters their described `startedBy` values. The loop
requires every observation to find no active matching task across an exponential-backoff window of
five minutes and retains any stopped-task evidence seen during that window. Exactly one stopped
task must be observed during that window, and its output must contain the expected schema-version 1 result for
the locked flush. Zero matches are not evidence that no task ran because ECS eventually ages stopped
tasks out of discovery; multiple matches, missing output, mismatched output, or otherwise
inconclusive evidence all mean keeping the lock. Only after the original launcher is confirmed
terminated, the full observation window finds no active task, and that one stopped result is
reviewed may you conditionally remove the same item with the exact `owner_token` captured above:

```bash
OWNER_VALUES="{\":owner\":{\"S\":\"$OWNER_TOKEN\"}}"

aws --profile "$PROFILE" --region us-west-2 dynamodb delete-item \
  --table-name voucha-valkey-admin-locks --key "$LOCK_KEY" \
  --condition-expression 'owner_token = :owner' \
  --expression-attribute-values "$OWNER_VALUES"
```

The final deployment recheck and ECS `RunTask` are separate AWS calls, so a deployment can still
begin in that narrow interval. The immutable task-definition ARN, image check, and captured network
configuration keep the launched task pinned to the already-validated revision; the rollout check
prevents known-active deployments but cannot make those two AWS APIs transactional.

A successful `RunTask` API response with no tasks and one or more well-formed ECS failures proves
that ECS rejected the launch before admitting a task, so the launcher releases its owned flush
lock. Transport failures, malformed or mixed responses, and any other uncertain outcome still use
exact-invocation reconciliation and retain the lock when admission cannot be proved either way.

Launcher operations require the service task definition to reference an immutable
`sha-<40 lowercase hex>` tag or an image digest. The launcher fails closed on bootstrap/schema-change
revisions that still reference `:latest`, because a new one-off task could otherwise resolve a
different image than the service tasks already running. Diagnosis remains available during an
unhealthy service or rollout when its selected task definition is immutable; deploy the backend's
SHA-tagged revision before using this path from a mutable bootstrap revision.

After the task stops, the launcher polls CloudWatch for a matching schema-version 1 result before
reporting success. The result must identify the requested operation and environment; flush results
must also identify the requested concern. Unrelated, malformed, or not-yet-ingested log events do
not count as operation evidence.

A failed ECS `DescribeTasks` lookup consumes one bounded task-status poll attempt instead of ending
the launcher immediately. If no attempt proves the task reached `STOPPED`, the launcher issues
`StopTask`, performs its separate bounded cleanup poll, and fails closed if cleanup still cannot be
proven.

### Rollback

There is no rollback for a flush — it is a deletion, not a reversible toggle. `caches`,
`recently-viewed`, `blooms`, `rate-limiter`, and `dynamic-config` self-heal (repopulated on next
read/access). `queues` obliterates all live and explicitly retained cleanup queue namespaces; check
[JOB-REPLAYABILITY.md](../requirements/platform/JOB-REPLAYABILITY.md) for which queues can be
backfilled afterward and which cannot. `sessions` logs out every user — there is no way to
restore sessions; users simply need to log back in.

A nonzero exit, timeout, signal, or CloudWatch evidence failure does not prove that a flush made no
changes. Prefix and queue deletion have no transaction or rollback and can be partially complete.
The launcher stops an unfinished task and reports task outcome separately from log-retrieval
outcome. As soon as a flush has an exact ECS task ARN, the launcher keeps the owned DynamoDB
admission lock and its caller/acquisition audit metadata through every timeout, signal, cleanup,
stopped-task validation, container-exit, and evidence-validation failure. It releases the lock only
after exit `0` and all required evidence are fully validated. Do not blindly repeat a flush:
diagnose again, inspect the task and CloudWatch evidence, then use the owner-conditioned manual
lock-release procedure above only after deciding whether another scoped attempt is necessary.

A matching schema-version 1 result paired with container exit `1` proves the requested operation
completed before task shutdown or termination failed. The launcher still returns nonzero because
the one-off task did not terminate cleanly. For a flush, it retains the owned DynamoDB admission
lock and audit metadata; preserve that result as operation evidence and do not repeat the flush.

Exit status `3` means the task itself succeeded but required evidence was incomplete, including a
missing image digest, unavailable CloudWatch logs, or a log stream that never produced the matching
schema-versioned result within the bounded poll. Exit status `4` means cleanup failed because
`StopTask` failed, the exact task did not reach `STOPPED` within the bounded cleanup poll, or an
interrupted `RunTask` outcome could not be identified safely, or the owned admission lock could
not be released. For a flush, status `3` also retains the admission lock. Both statuses require
original-launcher termination plus ECS, DynamoDB lock, and log review before another flush attempt.
Diagnosis is non-destructive and never acquires or retains this lock.

## Verify

```bash
# Wait 15-30 minutes after the flush, then re-run the same CloudWatch query used in Diagnose,
# looking back over that window, and confirm FreeableMemory trending back up /
# DatabaseMemoryUsagePercentage trending down.
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name FreeableMemory \
  --dimensions Name=CacheClusterId,Value="$CACHE_CLUSTER_ID" \
  --start-time "$(date -u -v-30M +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '-30 minutes' +%Y-%m-%dT%H:%M:%S)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
  --period 300 \
  --statistics Average \
  --output table
```

Expected result:

- `FreeableMemory` average increases (or `DatabaseMemoryUsagePercentage` decreases) after the
  flush, and `Evictions` stays at 0 going forward.
- For `queues`, confirm via the web UI or `GET /api/v1/valkey/cache-groups`/queue dashboards that
  the flushed queue's backlog is empty and workers resume normal processing without error spikes.

## Curated Break-Glass Boundary

There is intentionally no raw Valkey command (`INFO memory`, `BF.INFO <key>`, ad hoc `SCAN`) in the
supported procedure. The tested launcher interface accepts only the deployed `valkey-admin.mts`
command's curated arguments; it does not constrain what the underlying break-glass IAM principal
could run through AWS directly. Diagnosis returns allowlisted, typed fields rather than raw INFO,
patterns, URLs, credentials, or key names. Routine diagnosis and recovery stay on the admin UI/API;
this ECS path is a privileged secondary escape hatch, not a supported remote shell.

After the implementation image reaches staging, run only `diagnose` against the current staging
service task definition. Record the task ARN, task-definition ARN, image/digest, AWS
account/environment, timestamp, exit code, curated JSON, and CloudWatch locator on private issue
[#8115](https://github.com/jonathanong/filaments/issues/8115) within the seven-day staging log
retention window. Do not run production acceptance or close #8115 before that evidence exists.

## Stale-Doc Sync Notes

- `FLUSH_CONCERNS` (`backend/services/valkey-admin/flush.mts` / `web/types/api-responses`) and the
  bloom filter rebuild's filter union — if either enum changes, update the Recover step's option
  lists.
- `valkey-memory-high` (`vouchington-infra/opentofu/monitoring.tf`) — if the alarm's threshold, evaluation window, or
  dimensions change, update Diagnose step 2's description to match.
- `vouchington-infra/opentofu/valkey.tf`'s `replication_group_id` / `num_cache_clusters` — if the instance is ever
  split into multiple nodes or renamed, update the `CACHE_CLUSTER_ID` derivation above.
- `backend/entrypoints/api/valkey-admin-command.mts` and
  `vouchington-infra/opentofu/scripts/run-valkey-admin-task.sh` — keep command grammar, evidence, and safety procedure
  synchronized.

## See Also

- [Deployed Error Investigation](deployed-error-investigation.md) — application errors, worker
  `Unknown job`, and CloudWatch alarms (not Valkey memory)
- [`backend/services/valkey-admin/README.md`](../../backend/services/valkey-admin/README.md) — full
  Flush Concerns → prefix mapping
- [`backend/api/v1/valkey/README.md`](../../backend/api/v1/valkey/README.md) — full endpoint
  contracts
- [JOB-REPLAYABILITY.md](../requirements/platform/JOB-REPLAYABILITY.md) — which queues can be
  backfilled after a `queues` flush
- [`vouchington-infra` OpenTofu checklist](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/HUMAN_CHECKLIST.md) — Valkey provisioning and
  `valkey-url` SSM parameter background
