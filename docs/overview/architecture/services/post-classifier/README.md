# Post classifier service

Source entrypoint: [backend/services/post-classifier/README.md](../../../../../backend/services/post-classifier/README.md)

`@services/post-classifier` owns fixed post-classifier configuration and durable receipt effects.
The receipt fence admits only an approved current content revision, then locks the post,
configuration snapshot, and receipt lease in that order. It records provider attempts, commits
complete outcomes atomically, and completes any missing classifier votes and topic tags in one
transaction. Classifier effects never write clearance or review state.

The service uses the existing moderation configuration only for the local AI-generated detector's
threshold and result type. Existing moderator-agent histories and moderation behavior remain
separate until their cutover work explicitly removes them.

The local threshold is fingerprinted at the native detector's float32 precision so its returned
threshold can be checked exactly against the receipt. Topic-tag application imports the election
vote handler registration directly; it does not rely on worker bootstrap import order.

Configuration fingerprints hash PostgreSQL's canonical `jsonb::text` representation before
reservation. The JSONB replay envelope retains question array order, and the database verifies
the hash against those same bytes; JavaScript object-key serialization is not an identity boundary.

## Recovery transitions

| Failure mode                    | Durable state and recovery                                                                                               | Idempotency evidence                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Dispatch failure                | The reservation is durable before child enqueue; the five-minute receipt reconciler re-enqueues it.                      | Receipt identity is `(post, content hash, configuration hash)`.                 |
| Provider non-consumption        | The attempt service releases its lease before a rejected admission or records a retryable failure.                       | Lease token fences a later claim.                                               |
| Provider reply or worker loss   | Persisted outcomes are read and completed without another provider call.                                                 | Pre-reserved C3 batch and outcome stamps are immutable.                         |
| Retry and lease expiry          | Recovery streams incomplete, nonterminal receipts; a live lease delays the duplicate job.                                | Exact receipt ID, content hash, and configuration hash must all match.          |
| Revision or configuration drift | The obsolete receipt is superseded and excluded from recovery; the current approved fingerprint is reserved atomically.  | Supersession is durable and releases any old lease before replacement dispatch. |
| Notification delivery failure   | Tag writes create post-publication dirty work in the same transaction; its existing worker retries before acknowledging. | Existing post-publication dirty-work receipt.                                   |
| Terminal remote failure         | An uncommitted exhausted remote receipt is excluded from recovery.                                                       | Terminal timestamp is immutable.                                                |
| Provider client unavailable     | A missing key ends the remote half as `client-unavailable`, keeps the local outcome, and alarms.                         | Terminal kind is immutable; local outcome columns write once.                   |
| Recovery sweep bound            | Only a sweep enqueue that adds a job counts; at 10 with the job gone the receipt is given up and alarms.                 | The counter never decreases; a duplicate add of a live job is not counted.      |

A given-up receipt with an unpersisted remote half becomes terminal `sweep-bound-exceeded`. A
local-only or effect-only receipt cannot hold a terminal remote kind, so its counter only moves
past the bound and the sweep stops selecting it. The oldest in-flight receipt older than 26 hours
(longer than spend-cap parking) also raises a throttled `receipt-age` alarm.
