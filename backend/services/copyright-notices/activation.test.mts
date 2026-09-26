import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { publishImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import { assertCopyrightIntakeEnabled } from './activation.mts'
import { getCopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'

const completeEnvironment: NodeJS.ProcessEnv = {
  COPYRIGHT_INTAKE_ENABLED: 'true',
  MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID: 'distribution-id',
  MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED: 'true',
  MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED: 'true',
  MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
  MEDIA_DELIVERY_REGISTRY_TABLE: 'media-delivery-registry',
  S3_BUCKET_COPYRIGHT_EVIDENCE: 'copyright-evidence',
  SES_COPYRIGHT_REPLY_TO: 'tests+copyright-reply@voucha.ai',
  SES_COPYRIGHT_SOURCE_EMAIL: 'tests+copyright-source@voucha.ai',
}

describe('copyright intake activation', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('refuses a legal edge action when publication is disabled', async () => {
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'false')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'false')
    const publish = getCopyrightActionDeliveryDependencies({}).publishImagePlacementDeliveryRecord
    await expect(
      publish(
        {
          placementId: '00000000-0000-7000-8000-000000000001',
          revision: 1,
          imageId: '00000000-0000-7000-8000-000000000002',
          state: 'withheld',
        },
        {},
      ),
    ).rejects.toThrow('Media delivery enforcement requires both registry publication')
  })

  it('keeps injected edge publishers usable in isolated action tests', async () => {
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'false')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'false')
    const publish = vi.fn<typeof publishImagePlacementDeliveryRecord>().mockResolvedValue(undefined)
    const dependencies = getCopyrightActionDeliveryDependencies({
      ...createTestCopyrightDeliveryDependencies(publish),
    })
    await dependencies.publishImagePlacementDeliveryRecord(
      {
        placementId: '00000000-0000-7000-8000-000000000001',
        revision: 1,
        imageId: '00000000-0000-7000-8000-000000000002',
        state: 'withheld',
      },
      {},
    )
    expect(publish).toHaveBeenCalledOnce()
  })

  it('accepts a fully configured legal delivery boundary', () => {
    expect(() => assertCopyrightIntakeEnabled(completeEnvironment)).not.toThrow()
  })

  it.each([
    'MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED',
    'MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED',
    'MEDIA_DELIVERY_REGISTRY_TABLE',
    'MEDIA_DELIVERY_REGISTRY_REGION',
    'MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID',
  ])('fails closed when %s is absent', key => {
    expect(() =>
      assertCopyrightIntakeEnabled({ ...completeEnvironment, [key]: undefined }),
    ).toThrow('Copyright media delivery enforcement is not configured')
  })
})
