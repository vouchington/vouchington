# Media Delivery Reset and Restore

Operator contract for any reset, restore, or rebuild that touches media-delivery state. It is
staff-only guidance. The private infrastructure repository owns the provider-side procedure, access,
and identities; this page defines the required ordering, prohibited shortcuts, and evidence. Design
background is in the [service guide](../overview/architecture/services/media-delivery-safety/README.md).

## Why the three stores move together

Media delivery authority is projected into three places, and each can outlive the others:

- **PostgreSQL** holds the authority rows and the `media_delivery_registry_records` outbox. The
  outbox `generation` is drawn from a nontransactional sequence when a record is created, its
  desired state changes, or it is explicitly republished.
- **The edge registry** (DynamoDB, read by the CloudFront viewer-request function) is the record the
  edge enforces. A conditional write accepts a record only when the key is absent, the stored
  generation is lower, or the generation matches and the state is identical
  ([`media-delivery-registry.mts`](../../backend/modules/aws/media-delivery-registry.mts)).
- **The CloudFront cache** may hold a response after the edge record changes. The publisher
  invalidates the exact route after every accepted write.

A generation is comparable only within one continuous database history. A restore rewinds both the
rows and the sequence, while an edge that survived keeps its higher generations. The retired integer
offset never provided restore monotonicity and is not a fence. Do not reintroduce it.

The conditional write already refuses to overwrite a newer edge record with a stale generation, and
that rejection is the safe outcome. It is not a recovery: a stale write is retried, ends as a failed
row, and stays failed; operator replay reopens it at the same generation and is rejected again.
Reconciliation compares only PostgreSQL intent to PostgreSQL state and never reads the edge, and a
completed row is never written again. After an uncoordinated restore the edge can therefore keep a
stale allow or withhold in force with nothing in PostgreSQL that notices.

An absent edge record must deny. Confirm that with a canary request before relying on it (see
evidence below).

## Rules

- **Withhold wins.** Reconciliation may tighten (allow to withheld) without approval. Loosening
  (withheld to allow) needs the legal/trust-and-safety owner's recorded sign-off whenever the
  PostgreSQL side could predate the withhold, because a restore can lose a takedown that the edge
  still remembers. A key held this way is temporary: its edge denial survives only while workers
  are paused, because any later fresh generation (repair marker, owner change, republish) publishes
  the restored allow over it. Resolve every hold before workers resume.
- **Quiesce before restore, inventory before resume.** Pause the outbox worker, the root
  reconciler and periodic staging, repair-marker processing, and operator replay. Resume them only
  after the evidence below is recorded.
- **One consistent PostgreSQL snapshot.** Restore the rows and the generation sequence together.

## Prohibited

- Restoring or resetting PostgreSQL alone while the edge and cache are retained, then resuming
  workers.
- Restoring PostgreSQL rows without the sequence (or the sequence without the rows), or restoring a
  subset of the authority and registry tables.
- Lowering `generation`, resetting the sequence downward, or seeding it with a legacy offset.
- Using operator replay as the fix for stale-generation rejections.
- Deleting or overwriting an edge withhold to make a stale generation fit, or clearing an edge
  record without the sign-off above.
- Rolling the edge back to an older backup than PostgreSQL without reconciling every differing key.
- Invalidating the cache instead of reconciling the edge. The cache refills from the edge, so an
  invalidation cannot change what the edge enforces.
- Resuming workers while any hold is unresolved or before the evidence is recorded.

## Supported workflows

### A. PostgreSQL restore over a surviving edge

The edge may be ahead of the restored rows, and it may remember takedowns the restore lost.

1. Quiesce. Record the restore point, the sequence value, and the highest PostgreSQL generation.
2. Restore PostgreSQL from one consistent snapshot.
3. Export the edge inventory (key, state, generation) and classify every key against
   `media_delivery_registry_records`:

   | Edge versus PostgreSQL desired state         | Action                                                                                                                  |
   | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
   | Edge allow, PostgreSQL withheld              | Tighten: fence, then reopen.                                                                                            |
   | Edge withheld, PostgreSQL allow              | Hold: leave the row and edge denial untouched while paused, then resolve it in step 5.                                  |
   | Same state, edge generation ahead            | Fence, then reopen.                                                                                                     |
   | Same state, edge generation equal or behind  | None.                                                                                                                   |
   | Edge record absent, PostgreSQL row completed | Reopen. The edge denies until it is rewritten and remembers no withhold.                                                |
   | Edge record with no PostgreSQL row           | Keep a withheld record. Tighten an allow record (withhold or remove it), because PostgreSQL can no longer vouch for it. |

4. Fence and reopen the keys chosen above in one transaction:

   ```sql
   SELECT setval('media_delivery_registry_generation_sequence',
     GREATEST(:edge_high_water::bigint,
       (SELECT last_value FROM media_delivery_registry_generation_sequence)));
   UPDATE media_delivery_registry_records
   SET generation = generation + 1, state = 'pending', delivery_attempt_count = 0,
     claimed_at = NULL, completed_at = NULL, projected_at = NULL, invalidated_at = NULL,
     next_attempt_at = NULL, failure_message = NULL
   WHERE delivery_key = ANY(:reopen_keys::text[]);
   ```

   The sequence lift guarantees every new generation exceeds every edge generation. Assigning
   `generation + 1` is the republish marker that makes the trigger draw a fresh value. Never include
   a held key.

5. Resolve every hold. Either re-apply the lost takedown or restriction through the normal legal
   action flow (see [Copyright Notice Operations](copyright-notices.md)) so PostgreSQL authority
   withholds the placement, which needs no sign-off, or record the owner's sign-off and reopen the
   key like any other. A re-applied takedown advances the placement revision, so the held revision
   becomes historical and is staged withheld at a fresh generation above the edge, and every later
   republish stays withheld. The hold list must be empty before step 6. This repository has no
   operation that pins an edge denial independently of PostgreSQL authority. If a takedown cannot be
   re-applied, workers stay paused and the owner decides.
6. Resume workers. The publisher re-proves authority before any allow, writes the edge, invalidates
   the exact route, and marks the row completed.
7. For each tightened, held, or orphaned key, confirm invalidation completed, then record the
   evidence.

### B. Edge registry rebuild with PostgreSQL intact

PostgreSQL is current, so it is the authority and the edge is reconciled to it in full.

1. Quiesce. Rebuild or restore the edge registry and export its inventory.
2. Reopen every completed key that is absent from the edge or differs from PostgreSQL. Restoring an
   older edge backup can resurrect an allow that PostgreSQL has since withheld, so treat every
   differing key as in scope. Lift the sequence to the edge high-water mark only when the edge holds
   a generation above it.
3. Resume workers, wait for the outbox to drain, then record the evidence. Invalidate the affected
   cache paths if the workers did not.

### C. Full staging reset with retained edge and cache

A reset of the PostgreSQL `public` schema creates a fresh sequence and fresh UUIDv7 placement and
image ids, so new delivery keys cannot collide with retained edge records. The retained records for
the old keys, and any cached objects, stay in force and PostgreSQL can no longer withhold them.

1. Quiesce and record the edge inventory before the reset.
2. Reset PostgreSQL through the private infrastructure procedure.
3. Withhold every retained edge allow record, or remove it, and invalidate the affected cache
   paths. Retained withheld records may stay.
4. Resume workers and record the evidence.

### D. Cache-only invalidation or refill

No edge or PostgreSQL state changes. It is safe on its own, but it does not remediate a wrong edge
record.

## Required evidence

Attach these to the change record before workers resume, and again after.

- Before: restore point, sequence value, highest PostgreSQL generation, edge inventory export with
  count and highest generation, and the paused-worker list.
- Classification counts for every table row above, and for each hold its resolution: authority
  withholds the key again, or the owner's sign-off.
- After the fence: the sequence value is at least the highest edge generation, and no key has an
  edge generation above its PostgreSQL generation unless it is a resolved hold.
- Every reopened row reached `completed` with both `projected_at` and `invalidated_at` set. Any
  failed row is either a hold or investigated, never replayed.
- Invalidation completed for every tightened, orphaned, and rebuilt route.
- Canary requests through the CDN: a purged or absent key is denied, a withheld key is denied, and
  a known-good allowed placement is served.

## Validation

[`restore-generation-fence.test.mts`](../../backend/services/media-delivery-safety/restore-generation-fence.test.mts)
runs these against real PostgreSQL and a strict-generation edge double, using the same fence SQL
with its reopen scoped to owned keys because the shared test database is parallel:

- an edge record above a restored generation is never overwritten, and replay does not fix it
- a tightened state publishes above the retained generation only after the fence
- a held key keeps its edge denial only while paused, and a later fresh generation republishes the
  restored allow over it
- a held key stays withheld through republish once authority withholds it again
- a rebuilt empty edge is written only after an explicit reopen
- a retained pre-reset allow stays in force beside independent fresh keys, which is why workflow C
  withholds it

This repository ships no code that reads the edge inventory. The operator performs the inventory,
classification, and edge-side writes through the private infrastructure procedure, and the fence
above is the only PostgreSQL write this runbook requires.
