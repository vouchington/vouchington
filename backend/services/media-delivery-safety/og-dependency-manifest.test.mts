import { beginTransaction } from '@voucha/test-helpers'
import { advanceTestDeliveryPlacementRevision } from '@voucha/test-helpers/entities/media-delivery-repair'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import { describe, expect, it } from 'vitest'
import {
  authorizeOgDependencyManifest,
  registerOgDependencyManifest,
} from './og-dependency-manifest.mts'

describe('OG dependency manifests', () => {
  it('allows a registered current placement and an empty manifest', async () => {
    const { tuple } = await createTestDeliverySurface()
    const manifestId = await registerOgDependencyManifest([tuple])
    const emptyId = await registerOgDependencyManifest([])
    expect(await authorizeOgDependencyManifest(manifestId)).toBe('allow')
    expect(await authorizeOgDependencyManifest(emptyId)).toBe('allow')
  })

  it('denies an unknown manifest and a placement after it is withheld', async () => {
    const { tuple } = await createTestDeliverySurface()
    const manifestId = await registerOgDependencyManifest([tuple])
    expect(await authorizeOgDependencyManifest(crypto.randomUUID())).toBe('deny')
    await using query = await beginTransaction()
    await advanceTestDeliveryPlacementRevision(query, tuple.placementId)
    await query.commit()
    expect(await authorizeOgDependencyManifest(manifestId)).toBe('deny')
  })

  it('rejects a dependency whose placement does not exist', async () => {
    await expect(
      registerOgDependencyManifest([
        {
          placementId: crypto.randomUUID(),
          revision: 0,
          imageId: crypto.randomUUID(),
        },
      ]),
    ).rejects.toThrow('foreign key')
  })
})
