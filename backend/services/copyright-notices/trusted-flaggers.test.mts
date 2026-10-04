import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers/entities/users'
import {
  countTestCopyrightTrustedFlaggerChanges,
  createTestCopyrightTrustedFlagger,
} from '@voucha/test-helpers/copyright-trusted-flaggers'
import {
  getCopyrightTrustedFlagger,
  listCopyrightTrustedFlaggers,
  recordCopyrightTrustedFlaggerChange,
} from './trusted-flaggers.mts'

describe('staff-managed trusted flagger registry', () => {
  it('derives status from immutable changes and makes revocation final', async () => {
    const [administrator, moderator, linked, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createTestUser(),
    ])
    const entry = await createTestCopyrightTrustedFlagger(administrator, linked.id)
    expect(entry.status).toBe('active')
    expect((await getCopyrightTrustedFlagger(moderator, entry.id))?.status).toBe('active')
    await expect(getCopyrightTrustedFlagger(member, entry.id)).rejects.toMatchObject({
      status: 403,
    })
    await expect(
      recordCopyrightTrustedFlaggerChange(moderator, entry.id, {
        changeType: 'suspended',
        reason: 'Staff observation',
      }),
    ).rejects.toMatchObject({ status: 403 })

    await recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
      changeType: 'suspended',
      reason: 'Commission list shows suspension',
    })
    expect((await getCopyrightTrustedFlagger(moderator, entry.id))?.status).toBe('suspended')
    await expect(
      recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
        changeType: 'suspended',
        reason: 'Duplicate suspension',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
      changeType: 'reinstated',
      reason: 'Commission list shows reinstatement',
    })
    expect((await getCopyrightTrustedFlagger(moderator, entry.id))?.status).toBe('active')
    await recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
      changeType: 'revoked',
      reason: 'Commission list shows revocation',
    })
    expect((await getCopyrightTrustedFlagger(moderator, entry.id))?.status).toBe('revoked')
    await expect(
      recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
        changeType: 'reinstated',
        reason: 'Attempt to reopen revoked entry',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      recordCopyrightTrustedFlaggerChange(administrator, crypto.randomUUID(), {
        changeType: 'revoked',
        reason: 'Missing entry',
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('serializes two simultaneous suspensions into one change and one conflict', async () => {
    const [administrator, linked] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    const entry = await createTestCopyrightTrustedFlagger(administrator, linked.id)
    const before = await countTestCopyrightTrustedFlaggerChanges(entry.id)
    const results = await Promise.allSettled([
      recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
        changeType: 'suspended',
        reason: 'First recorded suspension',
      }),
      recordCopyrightTrustedFlaggerChange(administrator, entry.id, {
        changeType: 'suspended',
        reason: 'Concurrent recorded suspension',
      }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: { status: 409 } })
    expect(await countTestCopyrightTrustedFlaggerChanges(entry.id)).toBe(before + 1)
    expect((await getCopyrightTrustedFlagger(administrator, entry.id))?.status).toBe('suspended')
  })

  it('pages the reviewer registry by descending immutable id', async () => {
    const [administrator, moderator, linked] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
    ])
    for (let index = 0; index < 3; index++)
      await createTestCopyrightTrustedFlagger(administrator, linked.id)
    const first = await listCopyrightTrustedFlaggers(moderator, { limit: 1 })
    expect(first.results).toHaveLength(1)
    expect(first.hasNextPage).toBe(true)
    const second = await listCopyrightTrustedFlaggers(moderator, {
      limit: 1,
      afterId: first.results[0]!.id,
    })
    expect(second.results).toHaveLength(1)
    expect(second.results[0]!.id).not.toBe(first.results[0]!.id)
    expect(first.results[0]!.id.localeCompare(second.results[0]!.id)).toBeGreaterThan(0)
  })
})
