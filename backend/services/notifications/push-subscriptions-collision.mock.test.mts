import { createHash as actualCreateHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFLICT } from '@modules/on-error/error-codes'
import { createTestUserDirect, getTestWebPushEndpointOwnerByDigest } from '@voucha/test-helpers'

const digestMock = vi.hoisted(() => ({ value: '' }))

vi.mock(import('node:crypto'), async importActual => {
  const actual = await importActual()
  const createHash: typeof actual.createHash = (algorithm, options) => {
    const hash = actual.createHash(algorithm, options)
    if (algorithm === 'sha256' && digestMock.value) {
      hash.update = (() => hash) as typeof hash.update
      hash.digest = (() => digestMock.value) as unknown as typeof hash.digest
    }
    return hash
  }
  return {
    ...actual,
    createHash,
    default: { ...actual.default, createHash },
  }
})

import { upsertWebPushSubscription } from './push-subscriptions.mts'

describe('web push endpoint digest collision', () => {
  beforeEach(() => {
    digestMock.value = ''
  })

  it('rejects the conflicting claim and rolls back without changing the owner', async () => {
    const user = await createTestUserDirect()
    const ownedEndpoint = `https://push.example.test/${crypto.randomUUID()}`
    digestMock.value = actualCreateHash('sha256').update(ownedEndpoint).digest('hex')
    const subscription = await upsertWebPushSubscription(input(user!.id, ownedEndpoint))

    await expect(
      upsertWebPushSubscription(input(user!.id, 'https://push.example.test/collision')),
    ).rejects.toMatchObject({ status: 409, code: CONFLICT })

    await expect(getTestWebPushEndpointOwnerByDigest(digestMock.value)).resolves.toEqual({
      endpoint: ownedEndpoint,
      subscription_id: subscription.id,
    })
  })
})

function input(userId: string, endpoint: string) {
  return { userId, endpoint, p256dh: 'a'.repeat(32), auth: 'b'.repeat(16) }
}
