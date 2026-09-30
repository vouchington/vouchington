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
  input is built, so a retry, lease reclaim or replay cannot bill twice.
- **One reserved attempt per model call.** The client's `beforeAttempt` hook runs the shared spend
  admission, then `startClassifierProviderAttempt` reserves the counted attempt in Postgres before
  the request leaves. At the attempt cap the run ends terminal `attempts-exhausted`. The billing
  hooks fire once per reserved attempt.
- **Recorded failure, never a crash.** A `createClient` throw (for example a missing
  `OPENROUTER_API_KEY`) ends the remote half as terminal `client-unavailable`, keeps the local
  outcome and raises one `classifier_run_alarm` Sentry message. `provider-error` and
  `invalid-result` failures after a reserved attempt are recorded and retried while attempts remain.
  A spend-cap rejection before the reservation releases the lease without consuming an attempt.
- **Durable outcomes, never effects.** Outcomes are persisted atomically; the adapter's effects
  (votes, tags) are applied afterwards by `completeClassifierRun`.

The executor returns `persisted`, `replay`, `stale` or `terminal`. `context-rejected` failures are
accepted by the lifecycle but not produced here until provider error classification (#689) lands.

## Classifiers

| Classifier | Input builder                                             |
| ---------- | --------------------------------------------------------- |
| C5         | [`@agents/post-classifier`](../post-classifier/README.md) |

C8 and C9 add an input builder of this shape and register with the worker; nothing here changes.
