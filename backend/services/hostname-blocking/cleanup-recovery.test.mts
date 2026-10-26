import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestHostnameBlockCleanupRoot,
  insertTestUrlHostname,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { createTestUuidWindow } from '@voucha/test-helpers/uuid-window'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import { v7 as uuidv7 } from 'uuid'
import {
  ensureHostnameBlockCleanupOperation,
  getHostnameBlockCleanupOperation,
} from './cleanup-operation.mts'
import { advanceHostnameBlockPenaltyPage } from './cleanup-penalties.mts'
import { searchPendingHostnameBlockCleanups } from './cleanup-recovery.mts'
import { projectNextHostnameBlockSubdomainPage } from './cleanup-subdomains.mts'

describe('hostname block cleanup recovery', () => {
  it('attaches a current inherited parent block as a durable cleanup operation', async () => {
    const administrator = await createTestUserDirect({
      username: `cleanup-recovery-${randomToken()}`,
      administrator: true,
    })
    const parent = `cleanup-recovery-${randomToken()}.example.com`
    const parentId = await insertTestUrlHostname({ hostname: parent })
    await updateUrlHostnameBlocked(parentId, true)
    const child = `child.${parent}`
    const hostnameId = (await upsertUrlHostnames(null, [child])).get(child)!

    await using query = await beginTransaction()
    const operation = await ensureHostnameBlockCleanupOperation(
      query,
      hostnameId,
      administrator.id,
      'admin',
      false,
    )
    await query.commit()

    expect(operation).toMatchObject({
      hostnameId,
      hostname: child,
      blockedById: null,
      blockedSource: 'parent_hostname',
      penalizeCreators: false,
      progress: 0,
      blockedHostnameCount: 1,
    })
    await expect(getHostnameBlockCleanupOperation(operation.blockId)).resolves.toMatchObject({
      blockId: operation.blockId,
    })
  })

  it('returns stable no-work results for unknown, stale, and completed generations', async () => {
    const unknown = await projectNextHostnameBlockSubdomainPage(uuidv7(), 0, 'com.example', 1)
    expect(unknown).toEqual({
      operation: null,
      cursor: { stage: 'subdomains', afterReversedHostname: 'com.example' },
      projected: 0,
    })

    const administrator = await createTestUserDirect({
      username: `cleanup-stale-${randomToken()}`,
      administrator: true,
    })
    const hostnameId = await insertTestUrlHostname({
      hostname: `cleanup-stale-${randomToken()}.example.com`,
    })
    await using query = await beginTransaction()
    const operation = await ensureHostnameBlockCleanupOperation(
      query,
      hostnameId,
      administrator.id,
      'admin',
      true,
    )
    await query.commit()

    const stale = await projectNextHostnameBlockSubdomainPage(
      operation.blockId,
      operation.progress + 1,
      undefined,
      1,
    )
    expect(stale).toMatchObject({
      operation: { blockId: operation.blockId, progress: operation.progress },
      cursor: { stage: 'subdomains' },
      projected: 0,
    })

    const completed = await advanceHostnameBlockPenaltyPage(
      operation.blockId,
      operation.progress,
      true,
    )
    expect(completed?.completedAt).toBeInstanceOf(Date)
    await expect(
      advanceHostnameBlockPenaltyPage(operation.blockId, operation.progress, false),
    ).resolves.toMatchObject({ blockId: operation.blockId, completedAt: expect.any(Date) })
    const { firstId: recoveryAnchor, secondId: recoveryBlockId } = createTestUuidWindow()
    const recoveryHostnameId = await insertTestUrlHostname({
      hostname: `cleanup-recovery-query-${randomToken()}.example.com`,
    })
    await insertTestHostnameBlockCleanupRoot({
      blockId: recoveryBlockId,
      hostnameId: recoveryHostnameId,
      blockedById: administrator.id,
    })
    await expect(searchPendingHostnameBlockCleanups(recoveryAnchor, 1)).resolves.toEqual([
      { blockId: recoveryBlockId, progress: 0 },
    ])
    await expect(searchPendingHostnameBlockCleanups(undefined, 1)).resolves.toHaveLength(1)
    await advanceHostnameBlockPenaltyPage(recoveryBlockId, 0, true)
  })

  it('continues an exact-limit subdomain page from its durable reversed-hostname cursor', async () => {
    const administrator = await createTestUserDirect({
      username: `cleanup-page-${randomToken()}`,
      administrator: true,
    })
    const root = `cleanup-page-${randomToken()}.example.com`
    const [rootId] = await Promise.all([
      insertTestUrlHostname({ hostname: root }),
      insertTestUrlHostname({ hostname: `a.${root}` }),
      insertTestUrlHostname({ hostname: `b.${root}` }),
    ])
    await using query = await beginTransaction()
    const operation = await ensureHostnameBlockCleanupOperation(
      query,
      rootId,
      administrator.id,
      'admin',
      false,
    )
    await query.commit()

    const first = await projectNextHostnameBlockSubdomainPage(
      operation.blockId,
      operation.progress,
      undefined,
      1,
    )
    expect(first).toMatchObject({
      operation: { progress: operation.progress + 1 },
      cursor: { stage: 'subdomains', afterReversedHostname: expect.any(String) },
      projected: 1,
    })
    const firstCursor = first.cursor
    if (firstCursor.stage !== 'subdomains' || !firstCursor.afterReversedHostname) {
      throw new Error('Expected an exact-limit subdomain continuation')
    }
    const second = await projectNextHostnameBlockSubdomainPage(
      operation.blockId,
      first.operation!.progress,
      firstCursor.afterReversedHostname,
      1,
    )
    expect(second).toMatchObject({ operation: { progress: operation.progress + 2 }, projected: 1 })
  })
})

function randomToken(): string {
  return randomBytes(6).toString('hex')
}
