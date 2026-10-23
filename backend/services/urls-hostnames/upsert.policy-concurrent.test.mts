import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  getTestHostnameRow,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { blockHostnameInTransaction } from '../hostname-blocking/block-hostname.mts'
import { upsertUrlHostnames } from './upsert.mts'

describe('public hostname inheritance after ownership waits', () => {
  it('records a parent block committed while a mixed public batch waits', async () => {
    const staff = await createTestUser({ administrator: true })
    const parent = `policy-parent-${crypto.randomUUID()}.example.com`
    const child = `sub.${parent}`
    const parentId = (await upsertUrlHostnames(staff.id, [parent])).get(parent)!

    await using blocker = await beginTransaction()
    await blockHostnameInTransaction(staff.id, parentId, blocker, { penalizeCreators: false })
    const blockerPid = await getTestPostgresBackendProcessId(blocker)
    const publishing = upsertUrlHostnames(staff.id, [parent, child])
    void publishing.catch(() => {})

    await waitForTestPostgresLockWaiter(blockerPid, 'lockHostnameOwnership')
    await blocker.commit()

    const resolved = await publishing
    expect(resolved.get(parent)).toBe(parentId)
    const childId = resolved.get(child)!
    expect(await getTestHostnameRow(childId)).toMatchObject({
      publicly_introduced_at: expect.any(Date),
      is_blocked: true,
      blocked_at: expect.any(Date),
    })
  })
})
