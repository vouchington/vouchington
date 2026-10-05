# Post classifier service

Source entrypoint: [backend/services/post-classifier/README.md](../../../../../backend/services/post-classifier/README.md)

`@services/post-classifier` is the C5 adapter for the shared
[classifier run lifecycle](../classifier-runs/README.md). It owns only what is specific to fixed
post classification: fixed post-classifier configuration, the local detector outcome table, and the
durable effects (the post's topic relations and the classifier's votes on them). Receipt, lease,
reclaim, attempt reservation and cap, terminal failure, completion, supersession, dispatch and sweep
live in `@services/classifier-runs`.

The adapter's `lockCurrent` admits only an approved, current content revision of a live post and
locks it. Its `resolve` reads the post's community classifier configuration and fingerprints it. Its
`applyEffects` applies the remote decision through the shared relation boundary
(`applyTopicClassifierDecisionRelations`) and then tags the post with the local detector's positive
outcome, in one transaction. A positive remote result creates the post's `category` topic relation
when it is absent and votes +1 on it; a neutral or negative result votes 0 or -1 only on an
already live relation and never creates one, and a soft-deleted relation is never resurrected. The
classifier is an `ai_agent` and votes only on entity relations, never on a topic election, so it
writes no global topic election vote. Classifier effects never write clearance or review state.

The service uses the existing moderation configuration only for the local AI-generated detector's
threshold and result type. Existing moderator-agent histories and moderation behavior remain
separate until their cutover work explicitly removes them.

The local threshold is fingerprinted at the native detector's float32 precision so its returned
threshold can be checked exactly against the run. Local topic-tag application imports the election
vote handler registration directly; it does not rely on worker bootstrap import order.

Configuration fingerprints hash PostgreSQL's canonical `jsonb::text` representation before
reservation. The JSONB replay envelope retains question array order, and the database verifies the
hash against those same bytes; JavaScript object-key serialization is not an identity boundary.

## Local outcome

The local detector outcome is stored in `post_classifier_local_outcomes` (one insert-only row per
run) rather than on the receipt, because a run can end terminal after its local half succeeded. It is
persisted on every terminal kind that has one (`attempts-exhausted`, `client-unavailable`, and the
provider failure kinds), never revised, and read back at completion.

## Configuration never blocks approval

Approval writes a durable request row and does not read classifier configuration. A missing or
unresolvable configuration leaves the request pending for the recovery sweep, so a misconfigured
classifier can delay classification but never approval.

## Recovery transitions

The transition table, sweep bound and alarms are the shared ones in
[classifier runs](../classifier-runs/README.md#recovery-transitions). C5 adds one transition:

| Failure mode                  | Durable state and recovery                                                                                               | Idempotency evidence                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Notification delivery failure | Tag writes create post-publication dirty work in the same transaction; its existing worker retries before acknowledging. | Existing post-publication dirty-work receipt. |

A given-up run with an unpersisted remote half becomes terminal `sweep-bound-exceeded`. That path
retains no local outcome because the sweep has no detector inputs. A local-only or effect-only run
cannot hold a terminal remote kind, so its counter only moves past the bound and the sweep stops
selecting it.
