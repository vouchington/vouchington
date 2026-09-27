import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import {
  createTestPostDeliveryFixture,
  expectTestPostDeliveryRestored,
} from '@voucha/test-helpers/media-delivery-post'
import { removeCommentAsAgent } from './agent-moderate.mts'

describe('agent comment removal delivery recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps the comment and restores delivery when removal invalidation fails', async () => {
    await createSystemUser(MODERATION_SYSTEM_USERNAME)
    const fixture = await createTestPostDeliveryFixture('comment')
    const failure = new Error('Agent comment removal invalidation unavailable')
    fixture.edge.invalidatePath.mockRejectedValueOnce(failure)

    await expect(removeCommentAsAgent(fixture.postId)).rejects.toBe(failure)

    await expectTestPostDeliveryRestored(fixture)
  })
})
