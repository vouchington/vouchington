import { verifyCommittedMediaDeliveryReplayRoute } from '@voucha/test-helpers/copyright-api-media-replay'
import { useTestMediaDeliveryReplayProviders } from '@voucha/test-helpers/copyright-route-replay-setup'
import { describe, expect, it } from 'vitest'

describe('isolated global media replay route', () => {
  useTestMediaDeliveryReplayProviders()

  it('replays failed media registry records only for review staff and writes one audit event', async () => {
    expect(await verifyCommittedMediaDeliveryReplayRoute()).toBe(true)
  })
})
