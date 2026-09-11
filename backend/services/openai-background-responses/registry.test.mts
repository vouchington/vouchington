import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { setBackgroundResponseLeaseExpiresAt } from '@voucha/test-helpers'
import {
  acquireBackgroundResponseLease,
  registerBackgroundResponseLease,
  renewBackgroundResponseLease,
} from './register.mts'
import { claimExpiredBackgroundResponse, deleteBackgroundResponseRegistration } from './claim.mts'
import { getExpiredBackgroundResponses } from './expired.mts'

const DEEP_PAST = '1900-01-01T00:00:00Z'

function responseId(label: string): string {
  return `resp_${label}_${randomUUID()}`
}

describe('openai_background_responses leases', () => {
  it('reacquires an ambiguous registration only with the same pre-generated token', async () => {
    const id = responseId('same-token')
    const ownerToken = randomUUID()
    const registration = { responseId: id, agentSlug: `registry-${randomUUID()}` }

    await expect(registerBackgroundResponseLease(registration, ownerToken)).resolves.toMatchObject({
      responseId: id,
      leaseToken: ownerToken,
    })
    await expect(registerBackgroundResponseLease(registration, ownerToken)).resolves.toMatchObject({
      responseId: id,
      leaseToken: ownerToken,
    })
    await expect(registerBackgroundResponseLease(registration, randomUUID())).resolves.toBeNull()

    await expect(deleteBackgroundResponseRegistration(id, ownerToken)).resolves.toBe(true)
  })

  it('recovers an ambiguous committed acquisition by retrying with the same token', async () => {
    const id = responseId('ambiguous-acquisition')
    const registration = { responseId: id, agentSlug: `registry-${randomUUID()}` }
    const attemptedTokens: string[] = []
    let attempt = 0

    const lease = await acquireBackgroundResponseLease(registration, {
      register: async (candidate, leaseToken) => {
        attemptedTokens.push(leaseToken)
        const registered = await registerBackgroundResponseLease(candidate, leaseToken)
        attempt += 1
        if (attempt === 1) throw new Error('connection lost after commit')
        return registered
      },
    })

    expect(attemptedTokens).toHaveLength(2)
    expect(new Set(attemptedTokens)).toHaveLength(1)
    if (!lease) throw new Error('ambiguous committed acquisition was not recovered')
    expect(lease.leaseToken).toBe(attemptedTokens[0])
    await lease.stopAndSettle()
    await expect(deleteBackgroundResponseRegistration(id, lease.leaseToken)).resolves.toBe(true)
  })

  it('acquires a controller and exact-token deletion succeeds only once', async () => {
    const id = responseId('controller')
    const lease = await acquireBackgroundResponseLease({
      responseId: id,
      agentSlug: `registry-${randomUUID()}`,
    })
    if (!lease) throw new Error('lease was not acquired')
    await lease.stopAndSettle()

    await expect(deleteBackgroundResponseRegistration(id, lease.leaseToken)).resolves.toBe(true)
    await expect(deleteBackgroundResponseRegistration(id, lease.leaseToken)).resolves.toBe(false)
  })

  it('renews a live owner using the stable token and PostgreSQL time', async () => {
    const id = responseId('renew')
    const ownerToken = randomUUID()
    await registerBackgroundResponseLease(
      { responseId: id, agentSlug: `registry-${randomUUID()}` },
      ownerToken,
    )
    await setBackgroundResponseLeaseExpiresAt(id, DEEP_PAST)

    await expect(renewBackgroundResponseLease(id, ownerToken)).resolves.toBe(true)
    const expired = await getExpiredBackgroundResponses({ batchSize: 100 })
    expect(expired.some(row => row.responseId === id)).toBe(false)
    await expect(renewBackgroundResponseLease(id, randomUUID())).resolves.toBe(false)

    await deleteBackgroundResponseRegistration(id, ownerToken)
  })

  it('transfers an expired lease atomically and fences the former owner', async () => {
    const id = responseId('claim')
    const ownerToken = randomUUID()
    await registerBackgroundResponseLease(
      { responseId: id, agentSlug: `registry-${randomUUID()}` },
      ownerToken,
    )
    await setBackgroundResponseLeaseExpiresAt(id, DEEP_PAST)
    const candidate = (await getExpiredBackgroundResponses({ batchSize: 100 })).find(
      row => row.responseId === id,
    )
    if (!candidate) throw new Error('expired lease was not selected')

    const claimed = await claimExpiredBackgroundResponse(candidate)
    if (!claimed) throw new Error('expired lease was not claimed')
    expect(claimed.leaseToken).not.toBe(ownerToken)
    await expect(renewBackgroundResponseLease(id, ownerToken)).resolves.toBe(false)
    await expect(deleteBackgroundResponseRegistration(id, ownerToken)).resolves.toBe(false)
    await expect(claimExpiredBackgroundResponse(candidate)).resolves.toBeNull()

    await expect(deleteBackgroundResponseRegistration(id, claimed.leaseToken)).resolves.toBe(true)
  })

  it('rejects an expired candidate that renewed after selection', async () => {
    const id = responseId('selection-renewal')
    const ownerToken = randomUUID()
    await registerBackgroundResponseLease(
      { responseId: id, agentSlug: `registry-${randomUUID()}` },
      ownerToken,
    )
    await setBackgroundResponseLeaseExpiresAt(id, DEEP_PAST)
    const candidate = (await getExpiredBackgroundResponses({ batchSize: 100 })).find(
      row => row.responseId === id,
    )
    if (!candidate) throw new Error('expired lease was not selected')

    await expect(renewBackgroundResponseLease(id, ownerToken)).resolves.toBe(true)
    await expect(claimExpiredBackgroundResponse(candidate)).resolves.toBeNull()

    await deleteBackgroundResponseRegistration(id, ownerToken)
  })

  it('selects only expired leases and carries scope and ownership fields', async () => {
    const id = responseId('scope')
    const ownerToken = randomUUID()
    const agentSlug = `registry-${randomUUID()}`
    await registerBackgroundResponseLease(
      { responseId: id, agentSlug, communityId: null, postId: null },
      ownerToken,
    )
    expect(
      (await getExpiredBackgroundResponses({ batchSize: 100 })).some(row => row.responseId === id),
    ).toBe(false)

    await setBackgroundResponseLeaseExpiresAt(id, DEEP_PAST)
    const row = (await getExpiredBackgroundResponses({ batchSize: 100 })).find(
      candidate => candidate.responseId === id,
    )
    expect(row).toMatchObject({
      responseId: id,
      agentSlug,
      communityId: null,
      postId: null,
      leaseToken: ownerToken,
    })
    expect(row?.leaseExpiresAt).toBeInstanceOf(Date)
    expect(row?.createdAt).toBeInstanceOf(Date)

    await deleteBackgroundResponseRegistration(id, ownerToken)
  })

  it('orders equal expiries by response id and clamps the batch size', async () => {
    const prefix = `resp_order_${randomUUID()}`
    const first = `${prefix}_a`
    const second = `${prefix}_b`
    const firstToken = randomUUID()
    const secondToken = randomUUID()
    await registerBackgroundResponseLease(
      { responseId: second, agentSlug: `registry-${randomUUID()}` },
      secondToken,
    )
    await registerBackgroundResponseLease(
      { responseId: first, agentSlug: `registry-${randomUUID()}` },
      firstToken,
    )
    await setBackgroundResponseLeaseExpiresAt(first, DEEP_PAST)
    await setBackgroundResponseLeaseExpiresAt(second, DEEP_PAST)

    const rows = await getExpiredBackgroundResponses({ batchSize: 10_000 })
    expect(rows.length).toBeLessThanOrEqual(100)
    expect(
      rows
        .filter(row => row.responseId === first || row.responseId === second)
        .map(row => row.responseId),
    ).toEqual([first, second])

    await deleteBackgroundResponseRegistration(first, firstToken)
    await deleteBackgroundResponseRegistration(second, secondToken)
  })
})
