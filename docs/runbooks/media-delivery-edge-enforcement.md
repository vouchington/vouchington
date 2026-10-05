# Media Delivery Edge Enforcement

Operator procedure for turning media-delivery edge enforcement on in an environment. It is
staff-only guidance. The private infrastructure repository (`vouchington-infra`) owns the
provider-side changes, the deployed values, and access; this page defines the order, the checks,
and the evidence. It names no resource identifiers, and the values come from that repository.
Design background is in the [service guide](../overview/architecture/services/media-delivery-safety/README.md);
variable semantics are in the [environment variable reference](../overview/infrastructure/reference-environment-variables-aws-s3-storage.md#media-delivery).

## Why the order matters

Enforcement makes the edge deny every placement route (`/images/placements/*`) that has no allowed
record in the edge registry. Records reach the registry only through publication, so turning
enforcement on before the registry is complete makes every placement route return 404.

Two more facts set the order:

- A hosted image is projected publicly only after its registry record has published an allow. With
  publication off, an environment shows no hosted images at all.
- The infrastructure plan refuses enforcement while publication is off, and copyright intake and
  legal media actions refuse to run unless both flags are on.

Publication and enforcement are therefore two separate infrastructure changes. Each has its own plan
and its own apply, and the owner approves each one. Never combine them into one apply.

## Preconditions

- The owner has approved the plan for each apply before it runs.
- The private infrastructure configuration supplies the registry table, registry region, and
  distribution identifier to both the API and the worker tasks. Publication throws on first use
  when any of the three is missing.
- Read each environment's current flag values from the private infrastructure repository before
  you start. If publication is already on, begin at step 3.

## Enable media-delivery edge enforcement

1. **Turn publication on (first apply).** An infrastructure change sets
   `MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED` to `true` for the API and the worker and leaves
   enforcement off. After the owner applies it, redeploy the backend and the worker so the tasks
   read the new value. Copyright intake and legal media actions stay unavailable until step 6,
   because they need both flags.
2. **Let the reconciler drain.** The scheduled registry reconciliation job
   ([schedule](../../backend/queues/notifications/enqueues/schedules.mts), every five minutes)
   stages a bounded page of missing or changed records on each sweep and dispatches the unfinished
   ones for publication, so a large backlog takes several sweeps. Draining means repeating step 3
   until it returns no rows, not waiting for a single sweep.
3. **Check coverage.** Run the [coverage query](#coverage-query) against the primary database. It
   must return zero rows: every current placement has a `completed` registry record, and no
   `pending`, `claimed`, or `failed` record is left. Each returned row names the gap:

   | `state`              | Meaning                                                           | Action                                    |
   | -------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
   | `missing`            | A current placement has no registry record yet.                   | Wait for the next sweep, then recheck.    |
   | `pending`, `claimed` | The record is still converging.                                   | Wait for the next sweep, then recheck.    |
   | `failed`             | Delivery gave up on the record. `failure_message` has the reason. | Investigate it in step 4 before any wait. |

4. **Investigate failed rows.** Read each `failure_message`.
   - A rejection as a stale edge generation means the edge outlived a database restore or reset.
     Do not replay it: replay reopens the record at the same generation and the edge rejects it
     again. Follow workflow A or B in the
     [reset and restore runbook](media-delivery-reset-restore.md#supported-workflows) instead.
   - For a transient provider or configuration failure, fix the cause first. Then replay through
     `POST /api/v1/copyright-media-delivery/replays`, which needs a staff account allowed to review
     copyright notices. The endpoint reopens every failed record at once and takes no filter, so
     investigate all of them first. Return to step 2 afterward.
5. **Compare the edge inventory with PostgreSQL.** Use workflow B of the
   [reset and restore runbook](media-delivery-reset-restore.md#b-edge-registry-rebuild-with-postgresql-intact):
   export the edge inventory and classify every key against PostgreSQL. This repository ships no
   code that reads the edge, so the operator does it through the private infrastructure procedure.
   Resolve every differing key as that workflow directs before continuing.
6. **Turn enforcement on (second apply).** Rerun step 3 immediately before the apply, because new
   placements appear continuously and an earlier clean result expires. Only when it returns zero
   rows and step 5 is clean, a separate infrastructure change sets
   `MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED` to `true`. It gets its own plan and apply, approved by
   the owner. Redeploy the backend and the worker afterward.
7. **Verify after propagation.** Wait for the CloudFront change to finish propagating, then run the
   [image-resize placement monitor](../../monitors/lambdas/image-resize.mts) against the
   environment: `node monitors/lambdas/image-resize.mts <staging|production>`. Without input it
   proves only that a missing tuple and the removed generic route return 404. Set
   `TEST_IMAGE_PLACEMENT_PATH` to a current allowed placement route
   (`/images/placements/<placement id>/<placement revision>/<image id>`, built from a `completed`
   record whose desired state is `allow` and whose source image exists) so the monitor also proves
   that allowed images still serve. Set `LAMBDA_FUNCTION_URL` to add the direct-access check. See the
   [image-resize guide](../overview/infrastructure/lambdas/image-resize/README.md#development) for
   the exact checks.

This page defines no procedure for turning enforcement back off. If step 7 fails, stop and take it
to the infrastructure owner.

## Coverage query

The query returns one row per gap and zero rows when coverage is complete. It builds the exact
current delivery key for every non-retired placement from the same two binding tables the periodic
staging job reads, then compares it with the current registry record:

- A current placement with no record comes back as `missing`.
- A record in any state other than `completed` comes back, including records for historical
  revisions and retired placements, so unfinished work cannot hide behind a covered placement.
- A completed record counts as covered whether it allows or withholds. Coverage is about the edge
  holding an exact decision, not about the decision.

```sql
/* mediaDeliveryCoverageGaps */
WITH expected AS (
  SELECT concat('image-placement:', placement.id, ':', placement.revision, ':', binding.image_id) AS delivery_key,
    placement.id AS placement_id
  FROM media_placements placement
  JOIN (SELECT placement_id, image_id FROM image_placements
    UNION ALL SELECT placement_id, image_id FROM image_surface_placements) binding
    ON binding.placement_id = placement.id
  WHERE placement.retired_at IS NULL
)
SELECT delivery_key,
  COALESCE(expected.placement_id, record.placement_id) AS placement_id,
  COALESCE(record.state, 'missing') AS state,
  record.failure_message
FROM expected
FULL JOIN media_delivery_registry_current_records record USING (delivery_key)
WHERE record.state IS DISTINCT FROM 'completed'
ORDER BY delivery_key
```

## Evidence to record

Attach these to the change record for each environment.

- The owner's approval of each of the two plans, and the time of each apply.
- The zero-row coverage result from immediately before the second apply, with its timestamp.
- The edge-inventory comparison from step 5 and the resolution of every differing key.
- The monitor output from step 7, including whether `TEST_IMAGE_PLACEMENT_PATH` was set.

## Validation

[`delivery-registry-coverage.test.mts`](../../backend/services/media-delivery-safety/delivery-registry-coverage.test.mts)
reads the query from this page and runs it verbatim against real PostgreSQL, narrowed to the rows
it seeded because the shared test database is parallel. It proves that:

- a published placement is covered and an unpublished one is returned as `pending`
- a record that exhausted delivery comes back as `failed`
- a current placement with no record comes back as `missing`
- a completed record that withholds counts as covered
- a stale completed record for a replaced revision does not cover the current revision
