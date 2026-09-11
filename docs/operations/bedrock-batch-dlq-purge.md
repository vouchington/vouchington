# Bedrock Batch DLQ — Purge Runbook

Runbook for diagnosing and purging `bedrock-batch-dlq`, the dead-letter queue behind the Bedrock
embeddings batch pipeline's SQS event-ingress consumer.

## Scope

- Affected service or feature: `bedrock-batch` SQS queue and its `bedrock-batch-dlq` dead-letter
  queue (AWS-native event ingress — see
  [event-ingress.md](../overview/architecture/event-ingress.md)). EventBridge delivers raw AWS
  Bedrock "Batch Inference Job State Change" events directly onto `bedrock-batch`; the worker
  consumer that drains it is
  [`backend/workers/bedrock-batch-sqs/workers.mts`](../../backend/workers/bedrock-batch-sqs/workers.mts).
- Environments: staging, production (same Terraform module, one queue pair per environment via
  `local.name_prefix`).
- Operator role or permission needed: `voucha-dev` can read counts and receive samples, but cannot
  delete or purge. Purging requires a separately approved elevated profile with `sqs:PurgeQueue`
  scoped to this exact DLQ; retain the human gate and do not use production access for staging.
- Out of scope: the old cross-region defect is fixed. Staging uses a dedicated bucket in
  `us-east-1`, alongside its Bedrock batch jobs. Keep
  `Could not validate ListBucket permissions for S3URI` only as a historical-message classifier.

## Source Of Truth

- Infrastructure: [`vouchington-infra` OpenTofu](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/sqs-event-ingress.tf) (queue,
  DLQ, redrive policy, redrive-allow policy), `vouchington-infra/opentofu/monitoring.tf`
  (`bedrock_batch_dlq_messages` and `bedrock_batch_queue_age` CloudWatch alarms)
- Implementation: [`backend/workers/bedrock-batch-sqs/workers.mts`](../../backend/workers/bedrock-batch-sqs/workers.mts)
  (consumer registration), [`backend/workers/bedrock-batch-sqs/processors.mts`](../../backend/workers/bedrock-batch-sqs/processors.mts)
  (message handler — the source of the `Batch not found for jobArn` throw that lands messages in
  the DLQ after `maxReceiveCount` retries)
- Related docs: [event-ingress.md](../overview/architecture/event-ingress.md),
  [`backend/services/bedrock-embeddings-batch/README.md`](../../backend/services/bedrock-embeddings-batch/README.md)

## Prerequisites

- Required local tools: AWS CLI v2.
- Required cloud access: `voucha-dev` for staging count/read-only sampling. Production reads require
  a separately approved read profile. The separate elevated profile needs only `sqs:PurgeQueue` for
  the approved destructive step; sampling does not need `sqs:DeleteMessage`.
- Required secrets or environment variables: none beyond the AWS profile/credentials.
- Preflight checks: confirm which environment is affected (staging vs production) and its queue
  URL, `https://sqs.us-west-2.amazonaws.com/<account-id>/voucha-<environment>-bedrock-batch-dlq`.
  Confirm the `${name_prefix}-bedrock-batch-dlq-messages` CloudWatch alarm is actually in `ALARM`
  state before purging — do not purge speculatively.

## Procedure

### Execute

1. **Diagnose before purging.** Set `READ_PROFILE=voucha-dev` for staging. Production requires a
   separately approved read profile; never reuse `voucha-dev` there. Confirm the alarm and current
   depth:

   ```bash
   READ_PROFILE=voucha-dev
   aws cloudwatch describe-alarms --profile "$READ_PROFILE" \
     --alarm-names "voucha-<environment>-bedrock-batch-dlq-messages" \
     --region us-west-2

   aws sqs get-queue-attributes --profile "$READ_PROFILE" \
     --queue-url "https://sqs.us-west-2.amazonaws.com/<account-id>/voucha-<environment>-bedrock-batch-dlq" \
     --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible \
     --region us-west-2
   ```

2. **Sample a few messages to confirm the failure mode before discarding evidence.** A purge is
   irreversible (see Rollback). Record only the redacted class and count in the durable audit note;
   never copy message contents. Use
   `--visibility-timeout 0` so sampling does not hide messages. It still increments receive count;
   classify data in memory and output only queue, count, and redacted event class. Never print or
   persist message bodies or receipt handles:

   ```bash
   aws sqs receive-message --profile "$READ_PROFILE" \
     --queue-url "https://sqs.us-west-2.amazonaws.com/<account-id>/voucha-<environment>-bedrock-batch-dlq" \
     --max-number-of-messages 10 \
     --visibility-timeout 0 \
     --region us-west-2 --output json | \
     python3 -c 'import json, sys; messages = json.load(sys.stdin).get("Messages", []); classes = {"historical-region" if "Could not validate ListBucket" in message.get("Body", "") else "bedrock-state-change" for message in messages}; print(json.dumps({"queue": "bedrock-batch", "count": len(messages), "event_classes": sorted(classes)}))'
   ```

   Each message body is the raw EventBridge "Batch Inference Job State Change" event. A
   region-mismatch failure shows this text in the event detail's `message` field:

   ```text
   Could not validate ListBucket permissions for S3URI: ...
   ```

   A stale/unknown-`jobArn` failure instead means the consumer itself threw this error (no
   distinguishing text appears in the SQS body itself):

   ```text
   Batch not found for jobArn: ...
   ```

   An unknown `jobArn` can instead be a staging database reset or local-account event on the same
   EventBridge path. Preserve that classifier and do not make the consumer acknowledge every unknown
   job.

3. **Purge.**

   ```bash
   aws sqs purge-queue \
     --profile <approved-elevated-profile> \
     --queue-url "https://sqs.us-west-2.amazonaws.com/<account-id>/voucha-<environment>-bedrock-batch-dlq" \
     --region us-west-2
   ```

   A successful call returns no output and exit code `0`. This only confirms AWS _accepted_ the
   purge request, not that the queue is empty yet — see Verify.

## Verify

```bash
aws sqs get-queue-attributes \
  --profile "$READ_PROFILE" \
  --queue-url "https://sqs.us-west-2.amazonaws.com/<account-id>/voucha-<environment>-bedrock-batch-dlq" \
  --attribute-names ApproximateNumberOfMessages \
  --region us-west-2
```

Expected result:

- `ApproximateNumberOfMessages` reaches `0`. `purge-queue` is asynchronous and can take up to 60
  seconds to fully empty the queue — if the count is still nonzero immediately after step 3, wait
  and re-check rather than re-issuing the purge.
- The `bedrock-batch-dlq-messages` CloudWatch alarm (`ApproximateNumberOfMessagesVisible`, period
  60s) returns to `OK` on its next evaluation.

## Rollback

There is no rollback. `PurgeQueue` deletes every message currently in the queue and is not
reversible — AWS gives no confirmation step and no way to recover purged messages. `PurgeQueue` is
also rate-limited: a given queue can only be purged once per 60 seconds; a second call inside that
window returns `PurgeQueueInProgress`.

Purging does not fix the underlying cause. If the pipeline that feeds `bedrock-batch` is still
broken, new messages will begin failing and re-landing in the DLQ again as soon as new batch jobs
are submitted (see Scope's "Out of scope" note and **See Also**).

## Stale-Doc Sync Notes

- `aws_sqs_queue.bedrock_batch.redrive_policy.maxReceiveCount` (`vouchington-infra/opentofu/sqs-event-ingress.tf`) —
  currently `5`. If this changes, the number of redeliveries before a message reaches the DLQ
  changes with it.
- `bedrock_batch_dlq_messages` / `bedrock_batch_queue_age` alarm thresholds and dimensions
  (`vouchington-infra/opentofu/monitoring.tf`) — if the alarm name, threshold, or evaluation window changes, update
  step 1's `describe-alarms` call.
- `backend/workers/bedrock-batch-sqs/processors.mts` — if the handler's throw conditions change,
  update step 2's guidance on distinguishing failure modes from the raw message body.

## See Also

- [Deployed Error Investigation](deployed-error-investigation.md) — how to find the DLQ alarm and
  related worker logs before purging
- [event-ingress.md](../overview/architecture/event-ingress.md) — general AWS-native event-ingress
  routing pattern this queue follows
- [`vouchington-infra` OpenTofu](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/sqs-event-ingress.tf) — queue, DLQ, and redrive
  policy definitions
