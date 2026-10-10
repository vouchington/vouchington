# Media Delivery Edge Enforcement

Operator procedure for moving media delivery through `off`, `report`, and `enforce` in an
environment. The private infrastructure repository owns deployed values, edge behavior, metrics,
and access. This page defines order and evidence. Design background is in the
[service guide](../overview/architecture/services/media-delivery-safety/README.md); variable
semantics are in the [environment variable reference](../overview/infrastructure/reference-environment-variables-aws-s3-storage.md#media-delivery).

## Why the order matters

The edge denies placement routes and OG cards without an allowed registry record only in `enforce`.
In `report`, it reads the registry, logs and counts would-be blocks, and serves the request. Both
modes require registry publication. `off` is the default and performs no edge check. Post image
reads filter to completed allows only in `enforce`; post mutations maintain the registry in both
`report` and `enforce`. Copyright intake and legal media actions remain unavailable until `enforce`.

Publication, report mode, and enforcement are separate infrastructure changes. Each apply needs
its own owner-approved plan. Never combine them into one apply.

## Preconditions

- Read the environment's current values from private infrastructure. If publication is already on,
  begin with coverage and the report transition.
- The registry table, region, and distribution identifier reach backend and worker tasks.
  Publication throws on first use when any is absent.
- The image-resize Lambda receives the same mode, registry table, and region from infrastructure.
  The `/og/*` viewer-request check is attached only in `enforce`.

## Move through the modes

1. **Turn publication on.** Set `MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED` to `true` for the
   backend and worker, with `MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE=off`. Redeploy both tasks.
2. **Let reconciliation drain.** The [scheduled job](../../backend/queues/notifications/enqueues/schedules.mts)
   stages bounded pages of missing or changed records on each sweep. Repeat the coverage query
   until it returns zero rows.
3. **Check coverage.** Run the [coverage query](#coverage-query) against the primary database.
   Every current placement needs a completed record; pending, claimed, failed, and missing records
   identify gaps to resolve. A stale-generation rejection requires the
   [reset and restore runbook](media-delivery-reset-restore.md#supported-workflows). For a transient
   failure, fix the cause, then queue replay through
   `POST /api/v1/copyright-media-delivery/replays` (`202`, no count). Small jobs reopen failed
   records in cursor order; confirm completion through the coverage query and return to step 2.
4. **Compare edge inventory.** Use [workflow B](media-delivery-reset-restore.md#b-edge-registry-rebuild-with-postgresql-intact)
   to classify each edge key against PostgreSQL and resolve every difference.
5. **Turn report on.** Apply `MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE=report`, then redeploy backend
   and worker. The edge records each would-be block with path, placement, and reason, and serves
   the request. Follow the private infrastructure metric and alarm. Confirm the registry remains
   current while post mutations run.
6. **Observe a quiet window.** Report mode must show zero would-be blocks for 24 hours in staging
   and 7 days in production. The owner may change these window defaults. Investigate every block
   before continuing. Keep checking coverage as new placements appear.
7. **Turn enforcement on.** Immediately before the apply, verify both gates: report mode has zero
   would-be blocks for the quiet window and the coverage query returns zero rows now. Recheck the
   edge inventory from step 4. With the owner's separate approval, apply
   `MEDIA_DELIVERY_EDGE_ENFORCEMENT_MODE=enforce` and redeploy backend and worker.
8. **Verify after propagation.** After CloudFront propagation, run
   `node monitors/lambdas/image-resize.mts <staging|production>`. Set
   `TEST_IMAGE_PLACEMENT_PATH` to a current allowed route so the monitor proves an allowed image
   still serves, and set `LAMBDA_FUNCTION_URL` for the direct-access check. Follow the
   [image-resize guide](../overview/infrastructure/lambdas/image-resize/README.md#development)
   and the staging `/og/*` warm-cache probe in the infrastructure tracker.

If step 8 fails, stop and take it to the infrastructure owner.

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
    placement.id AS placement_id, placement.revision AS placement_revision, binding.image_id
  FROM media_placements placement
  JOIN (SELECT placement_id, image_id FROM image_placements
    UNION ALL SELECT placement_id, image_id FROM image_surface_placements) binding
    ON binding.placement_id = placement.id
  WHERE placement.retired_at IS NULL
)
SELECT COALESCE(expected.delivery_key, record.delivery_key) AS delivery_key,
  COALESCE(expected.placement_id, record.placement_id) AS placement_id,
  COALESCE(record.state, 'missing') AS state,
  record.failure_message
FROM expected
FULL JOIN view_media_delivery_registry_current_records record
  ON record.placement_id = expected.placement_id
  AND record.placement_revision = expected.placement_revision
  AND record.image_id = expected.image_id
WHERE record.state IS DISTINCT FROM 'completed'
ORDER BY delivery_key
```

## Evidence to record

Attach these to the change record for each environment.

- The owner's approval of each publication, report, and enforcement plan, and the time of each apply.
- The report-mode would-be-block measurements and quiet-window timestamps.
- The zero-row coverage result from immediately before enforcement, with its timestamp.
- The edge-inventory comparison from step 5 and the resolution of every differing key.
- The monitor output from step 7, including whether `TEST_IMAGE_PLACEMENT_PATH` was set.

## Validation

[`delivery-registry-coverage.test.mts`](../../backend/services/media-delivery-safety/delivery-registry-coverage.test.mts)
reads the query from this page and runs it verbatim against real PostgreSQL, narrowed to the rows
it seeded because the shared test database is parallel. It proves that:

- a published placement is covered and an unpublished one is returned as `pending`
- a record that exhausted delivery comes back as `failed`
- a post image placement with no record comes back as `missing`, then as `pending` once staged
- a completed record that withholds counts as covered
- a stale completed record for a replaced revision does not cover the current revision
