# Classifier run executor

Source entrypoint: [backend/agents/classifier-runs/README.md](../../../../../backend/agents/classifier-runs/README.md)

`@agents/classifier-runs` runs one leased [classifier run](../../services/classifier-runs/README.md)
for any fixed classifier. `executeClassifierRun` owns everything about the model call that is not
specific to a classifier; a classifier supplies only `ClassifierRunInputs`:

- `buildRemoteInput` builds the bounded, sanitized remote request, or returns null for a
  local-only run. It runs before local detection and before any provider spend.
- `detectLocal` produces the optional local outcome and is required exactly when the run's
  configuration asks for one.
- `createClient` builds the provider client from the executor's `beforeAttempt` hook.

## What the executor guarantees

- **Replay before input.** A run that already has persisted outcomes returns `replay` before any
  input is built, so a replay or lease reclaim cannot spend again. A crash or lease loss between
  the provider returning and the outcomes being persisted can still spend another attempt, within
  the attempt cap. A signal that aborts after the provider returned never discards that response.
- **One reserved attempt per model call.** The client's `beforeAttempt` hook runs the shared spend
  admission, then `startClassifierProviderAttempt` reserves the counted attempt in Postgres before
  the request leaves. At the attempt cap the run ends terminal `attempts-exhausted`. The billing
  hooks fire once per reserved attempt.
- **Recorded failure, never a crash.** A `createClient` throw (for example a missing
  `OPENROUTER_API_KEY`) ends the remote half as terminal `client-unavailable`, keeps the local
  outcome and raises one `classifier_run_alarm` Sentry message. `provider-error` and
  `invalid-result` failures after a reserved attempt are recorded and retried while attempts remain.
  A spend-cap rejection before the reservation releases the lease without consuming an attempt.
- **A provider failure is classified once, here.** `classifyFailure`
  (`failure-classification.mts`) reads the structured-decision client's `retryClass` (see
  [provider failures](../../backend/modules/structured-decisions/README.md#provider-failures)), so C5
  and C6 and every later classifier share one outcome. A transient failure releases the lease and
  rethrows for a queue retry. A permanent one ends the run at once, as terminal `context-rejected`
  for a moderation block (quiet: it is about the content, not the deployment) and as terminal
  `provider-error` for any other rejection (a rejected key, exhausted credits, a malformed request,
  a guardrail block), which also raises one `classifier_run_alarm` of kind `provider-rejected` with
  the status, code and error type only. Neither the provider's message nor any content reaches the
  alarm.
- **Durable outcomes, never effects.** Outcomes are persisted atomically; the adapter's effects
  (votes, tags) are applied afterwards by `completeClassifierRun`.

The executor returns `persisted`, `replay`, `stale` or `terminal`.

### Retry budget

One number caps both the queue and the receipt: `CLASSIFIER_RUN_ATTEMPTS` (8) is the `classifier-run`
job's `attempts` and the `maxAttempts` the handler gives the executor. A queue retry therefore never
reserves a provider attempt the receipt would refuse, and the recovery sweep can never buy an
attempt beyond the cap. The worker's `classifier-run-outage` backoff waits about 30 seconds, then
doubles, so a transient outage is ridden out for about 63.5 minutes (up to about 79 with jitter)
before the run ends terminal `provider-error`; see the
[queue backoff](../../queues/workers/ai-agents/README.md#classifier-run-backoff).

The dispatcher, run and sweep jobs that call the executor live on the `ai_agents` queue; see the
[queue package](../../../../../backend/queues/ai-agents/README.md) for their enqueue surface.

## Classifiers

| Classifier | Input builder                                                                  |
| ---------- | ------------------------------------------------------------------------------ |
| C5         | [`@agents/post-classifier`](../post-classifier/README.md)                      |
| C6         | [`@agents/autotagger`](../autotagger/README.md)                                |
| C7         | [`@agents/autotagger`](../autotagger/README.md#c7-scoped-reasoning-autotagger) |
| C8         | [`@agents/community-moderation`](../community-moderation/README.md)            |
| C9         | [`@agents/story-clustering`](../story-clustering/README.md)                    |

A new classifier adds an input builder of this shape and registers with the worker; nothing here
changes.
