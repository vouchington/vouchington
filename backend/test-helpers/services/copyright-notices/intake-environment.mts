import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Stubs every setting `assertCopyrightIntakeEnabled` requires before each test in the describe
 * block and restores the environment after each one. `enabled: false` keeps the full evidence,
 * email, and media-delivery configuration so a rejection proves the switch alone closed intake.
 */
export function useCopyrightIntakeEnvironment({ enabled = true } = {}): void {
  beforeEach(() => {
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', String(enabled))
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.stubEnv('SES_COPYRIGHT_SOURCE_EMAIL', 'copyright@voucha.ai')
    vi.stubEnv('SES_COPYRIGHT_REPLY_TO', 'copyright@voucha.ai')
    vi.stubEnv('MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED', 'true')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_TABLE', 'test-media-delivery-registry')
    vi.stubEnv('MEDIA_DELIVERY_REGISTRY_REGION', 'us-east-1')
    vi.stubEnv('MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID', 'test-distribution')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })
}
