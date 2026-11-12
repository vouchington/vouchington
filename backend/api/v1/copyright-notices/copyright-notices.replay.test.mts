import { describe, expect, it } from 'vitest'
import { verifyCopyrightActionReplayRoute } from '@voucha/test-helpers/copyright-route-replay-fixtures'
import { useTestMediaDeliveryReplayProviders } from '@voucha/test-helpers/copyright-route-replay-setup'

describe('copyright notice replay routes', () => {
  useTestMediaDeliveryReplayProviders()

  it('replays a failed action only for copyright-review staff and records one scoped audit event', async () => {
    expect(await verifyCopyrightActionReplayRoute()).toBe(true)
  })
})
