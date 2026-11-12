import { afterEach, beforeEach, vi } from 'vitest'
import { mediaDeliveryEdgeEnvironment } from '../../media-delivery-emulator.mts'

/**
 * Stubs every setting `assertCopyrightIntakeEnabled` requires before each test in the describe
 * block and restores the environment after each one. `enabled: false` keeps the full evidence,
 * email, and media-delivery configuration so a rejection proves the switch alone closed intake.
 */
export function useCopyrightIntakeEnvironment({ enabled = true } = {}): void {
  beforeEach(async () => {
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', String(enabled))
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.stubEnv('SES_COPYRIGHT_SOURCE_EMAIL', 'copyright@voucha.ai')
    vi.stubEnv('SES_COPYRIGHT_REPLY_TO', 'copyright@voucha.ai')
    for (const [name, value] of Object.entries(await mediaDeliveryEdgeEnvironment())) {
      vi.stubEnv(name, value)
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })
}
