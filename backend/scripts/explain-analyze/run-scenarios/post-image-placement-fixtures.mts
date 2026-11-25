import assert from 'node:assert/strict'
import { write, type QueryExecutor } from '@data-stores/psql'

type ImagePlacement = {
  image_id: string
  placement_id: string
  revision: number
  retirement_reason: string | null
  retained_family: string | null
}

export async function readPostImagePlacements(postId: string, query: QueryExecutor = write) {
  const { rows } = await query<ImagePlacement>(
    `/* readPostImageWritePlacements */
     SELECT child.image_id, child.placement_id, parent.revision, parent.retirement_reason,
       retained.binding_family AS retained_family
     FROM image_placements child
     JOIN media_placements parent ON parent.id = child.placement_id
     LEFT JOIN retained_image_placement_bindings retained
       ON retained.placement_id = child.placement_id AND retained.image_id = child.image_id
         AND retained.binding_family = child.binding_family
     WHERE child.post_id = $1 ORDER BY child.image_id`,
    [postId],
  )
  return rows
}

export function assertPostImagePlacementChange(
  before: ImagePlacement[],
  after: ImagePlacement[],
  expectedImages: readonly string[],
) {
  const expected = new Set(expectedImages)
  const prior = new Map(before.map(row => [row.image_id, row]))
  assert.deepEqual(
    after.map(row => row.image_id),
    [...new Set([...prior.keys(), ...expected])].toSorted(),
  )
  assert.deepEqual(
    after.filter(row => row.retirement_reason === null).map(row => row.image_id),
    [...expected].toSorted(),
  )
  const created = after.filter(row => !prior.has(row.image_id))
  for (const row of after) {
    const earlier = prior.get(row.image_id)
    const retired = earlier !== undefined && !expected.has(row.image_id)
    assert.equal(row.retained_family, 'post')
    assert.equal(row.retirement_reason, retired ? 'owner_removed' : null)
    assert.equal(row.revision, (earlier?.revision ?? 0) + Number(retired))
    if (earlier) assert.equal(row.placement_id, earlier.placement_id)
  }
  assert.equal(new Set(after.map(row => row.placement_id)).size, after.length)
  return created
}

// Each EXPLAIN replays one production INSERT inside a rollback. Persist only the earlier
// prerequisite rows for that statement's IDs. The measured rows themselves are still absent.
export async function preparePostImagePlacementReplay(
  created: ImagePlacement[],
  includeParents: boolean,
): Promise<void> {
  const placementIds = created.map(row => row.placement_id)
  await write(
    `/* preparePostImagePlacementReplay:retained */
     INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
     SELECT placement_id, image_id, 'post'
     FROM unnest($1::uuid[], $2::uuid[]) AS input(placement_id, image_id)`,
    [placementIds, created.map(row => row.image_id)],
  )
  if (includeParents) {
    await write(
      `/* preparePostImagePlacementReplay:parents */
       INSERT INTO media_placements (id) SELECT unnest($1::uuid[])`,
      [placementIds],
    )
  }
}
