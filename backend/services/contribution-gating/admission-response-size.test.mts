import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  ensureTestAdmittedPostIdentity,
} from '@voucha/test-helpers'
import { runContributionAdmission } from './admission.mts'

describe('contribution admission response storage', () => {
  it('stores and replays a response near the maximum accepted mutation payload', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const response = { post: { id: crypto.randomUUID(), markdown: 'x'.repeat(1_200_000) } }
    const input = {
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { post_type: 'discussion', title: crypto.randomUUID() },
    }
    const execute = async (query: TransactionQuery) => {
      await ensureTestAdmittedPostIdentity(query, response.post.id)
      return response
    }
    await expect(runContributionAdmission({ ...input, execute })).resolves.toEqual({
      kind: 'created',
      response,
    })
    await expect(runContributionAdmission({ ...input, execute })).resolves.toEqual({
      kind: 'replay',
      response,
    })
  })
})
