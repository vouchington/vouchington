import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestUserWarning } from '@voucha/test-helpers'
import { listReceivedUserWarnings } from '../get.mts'
import { revokeUserWarning } from '../revoke.mts'

describe('listReceivedUserWarnings member projection', () => {
  it('returns revocation state without staff-only warning fields', async () => {
    const [issuer, recipient] = await Promise.all([createTestUser(), createTestUser()])
    const warning = await insertTestUserWarning({
      userId: recipient.id,
      issuedById: issuer.id,
      reason: `Member projection ${crypto.randomUUID()}`,
    })
    await revokeUserWarning(issuer.id, warning.id)

    const { warnings } = await listReceivedUserWarnings(recipient.id)
    const received = warnings.find(item => item.id === warning.id)

    expect(received?.revoked_at).toBeInstanceOf(Date)
    expect(Object.keys(received!).sort()).toEqual([
      'community_id',
      'community_slug',
      'created_at',
      'id',
      'public_message',
      'revoked_at',
      'user_id',
    ])
  })
})
