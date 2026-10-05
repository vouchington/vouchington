import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestMediaDeliveryRecord,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  markTestMediaDeliveryRecordFailed,
} from '@voucha/test-helpers'
import { advanceTestDeliveryPlacementRevision } from '@voucha/test-helpers/entities/media-delivery-repair'
import { listTestMediaDeliveryCoverageGaps } from '@voucha/test-helpers/media-delivery-coverage'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import {
  getImagePlacementDeliveryKey,
  processMediaDeliveryRegistryRecord,
  stageImagePlacementDeliveryRecord,
} from './index.mts'

const RUNBOOK = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'docs',
  'runbooks',
  'media-delivery-edge-enforcement.md',
)

type Fixture = Awaited<ReturnType<typeof createTestDeliverySurface>>

let coverageQuery = ''

/** The operator runs the runbook's query, so the test executes that exact text. */
async function readRunbookCoverageQuery(): Promise<string> {
  const section = (await readFile(RUNBOOK, 'utf8')).split('\n## Coverage query\n')[1]
  const query = section?.match(/```sql\n([\s\S]*?)\n```/)?.[1]
  if (!query) throw new Error('The edge-enforcement runbook has no coverage query')
  return query
}

async function gapsFor(...fixtures: Fixture[]) {
  return listTestMediaDeliveryCoverageGaps(
    coverageQuery,
    fixtures.map(fixture => fixture.tuple.placementId),
  )
}

async function publish(fixture: Fixture): Promise<void> {
  await expect(processMediaDeliveryRegistryRecord(fixture.deliveryKey)).resolves.toBe('completed')
}

describe('media delivery edge enforcement coverage query', () => {
  beforeAll(async () => {
    coverageQuery = await readRunbookCoverageQuery()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('returns exactly the unpublished placement of two seeded placements', async () => {
    installTestMediaDeliveryEdge()
    const [published, unpublished] = await Promise.all([
      createTestDeliverySurface(),
      createTestDeliverySurface(),
    ])
    expect(await gapsFor(published, unpublished)).toHaveLength(2)

    await publish(published)

    expect(await gapsFor(published, unpublished)).toEqual([
      {
        delivery_key: unpublished.deliveryKey,
        placement_id: unpublished.tuple.placementId,
        state: 'pending',
        failure_message: null,
      },
    ])
  })

  it('returns no rows once every seeded placement is published', async () => {
    installTestMediaDeliveryEdge()
    const [first, second] = await Promise.all([
      createTestDeliverySurface(),
      createTestDeliverySurface(),
    ])
    await publish(first)
    await publish(second)

    expect(await gapsFor(first, second)).toEqual([])
  })

  it('returns a record that exhausted delivery as failed with its reason', async () => {
    const fixture = await createTestDeliverySurface()
    await markTestMediaDeliveryRecordFailed(fixture.deliveryKey)

    expect(await gapsFor(fixture)).toEqual([
      expect.objectContaining({
        delivery_key: fixture.deliveryKey,
        state: 'failed',
        failure_message: expect.any(String),
      }),
    ])
  })

  it('returns a post image placement that has no registry record as missing', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const postId = await insertTestPost({
      title: 'Owned coverage fixture',
      slug: crypto.randomUUID(),
      createdById: user.id,
      markdown: 'Coverage fixture image',
    })
    await insertTestPostImage({ postId, imageId })
    const placement = await getTestPostImagePlacement(postId, imageId)
    if (!placement) throw new Error('Missing test post image placement')
    const tuple = {
      placementId: placement.placement_id,
      revision: placement.placement_revision,
      imageId,
    }
    const deliveryKey = getImagePlacementDeliveryKey(tuple)

    expect(await listTestMediaDeliveryCoverageGaps(coverageQuery, [tuple.placementId])).toEqual([
      {
        delivery_key: deliveryKey,
        placement_id: tuple.placementId,
        state: 'missing',
        failure_message: null,
      },
    ])

    await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' })
    expect(await listTestMediaDeliveryCoverageGaps(coverageQuery, [tuple.placementId])).toEqual([
      expect.objectContaining({ delivery_key: deliveryKey, state: 'pending' }),
    ])
  })

  it('counts a completed withhold as covered', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestDeliverySurface()
    await stageImagePlacementDeliveryRecord({ ...fixture.tuple, state: 'withheld' })
    await publish(fixture)

    expect(await getTestMediaDeliveryRecord(fixture.deliveryKey)).toMatchObject({
      desired_state: 'withheld',
      state: 'completed',
    })
    expect(await gapsFor(fixture)).toEqual([])
  })

  it('does not let a completed record for a replaced revision cover the current one', async () => {
    installTestMediaDeliveryEdge()
    const fixture = await createTestDeliverySurface()
    await publish(fixture)
    await using transaction = await beginTransaction()
    const revision = await advanceTestDeliveryPlacementRevision(
      transaction,
      fixture.tuple.placementId,
    )
    await transaction.commit()

    expect(await gapsFor(fixture)).toEqual([
      expect.objectContaining({
        delivery_key: getImagePlacementDeliveryKey({ ...fixture.tuple, revision }),
        state: expect.stringMatching(/^(missing|pending)$/),
      }),
    ])
  })
})
