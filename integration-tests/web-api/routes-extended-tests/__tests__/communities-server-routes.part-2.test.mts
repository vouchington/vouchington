import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import * as clientRoutes from '@/lib/api/client'
import { installRoutesExtendedHarness } from '../../../test-helpers/routes-extended-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('routes-extended', () => {
  const harness = installRoutesExtendedHarness({
    unset,
    workerSecret: 'always',
  })

  describe('communities client routes', () => {
    it('createCommunity returns the persisted community', async () => {
      const communityId = randomUUID()
      const slug = `ext-test-community-${communityId}`

      const result = await harness.withClientRuntime(
        () =>
          clientRoutes.createCommunity({
            name: `Extended Test Community ${communityId}`,
            slug,
          }),
        harness.userCookieHeader,
      )
      expect(result.community.slug).toBe(slug)
    })
  })
})
