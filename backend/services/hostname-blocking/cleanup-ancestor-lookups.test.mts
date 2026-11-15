import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { beginTransaction, createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import { insertTestHostnameBlockCleanupRoot } from '@voucha/test-helpers/entities/hostname-blocking'
import {
  getPendingDescendantCleanupRootHostnames,
  lockPendingAncestorHostnameBlockCleanup,
} from './cleanup-operation-ancestor.mts'

describe('pending hostname cleanup root lookups', () => {
  it('chooses the deepest ancestor and the first root when that ancestor has raced roots', async () => {
    const actor = await createTestUser()
    const hostname = `ancestor-${crypto.randomUUID()}.example.com`
    const parentId = await insertTestUrlHostname({ hostname })
    const deepId = await insertTestUrlHostname({ hostname: `deep.${hostname}` })
    const parentRoot = uuidv7()
    const deepRoots = [uuidv7(), uuidv7()].toSorted()
    await insertTestHostnameBlockCleanupRoot({
      blockId: parentRoot,
      hostnameId: parentId,
      blockedById: actor.id,
    })
    for (const blockId of deepRoots) {
      await insertTestHostnameBlockCleanupRoot({
        blockId,
        hostnameId: deepId,
        blockedById: actor.id,
      })
    }

    await using query = await beginTransaction()
    await expect(
      lockPendingAncestorHostnameBlockCleanup(query, `leaf.deep.${hostname}`),
    ).resolves.toMatchObject({ id: deepRoots[0], stage: 'subdomains', penalizeCreators: false })
    await expect(
      lockPendingAncestorHostnameBlockCleanup(query, `sibling.${hostname}`),
    ).resolves.toMatchObject({ id: parentRoot })
  })

  it('returns only candidate descendant roots, despite duplicate pending roots', async () => {
    const actor = await createTestUser()
    const hostname = `descendant-${crypto.randomUUID()}.example.com`
    const rootHostnameId = await insertTestUrlHostname({ hostname })
    const deepHostnameId = await insertTestUrlHostname({ hostname: `deep.${hostname}` })
    const unrelatedId = await insertTestUrlHostname({ hostname: `other.${hostname}` })
    const rootId = uuidv7()
    for (const [blockId, hostnameId] of [
      [rootId, rootHostnameId],
      [uuidv7(), deepHostnameId],
      [uuidv7(), deepHostnameId],
      [uuidv7(), unrelatedId],
    ] as const) {
      await insertTestHostnameBlockCleanupRoot({ blockId, hostnameId, blockedById: actor.id })
    }
    const reversed = `deep.${hostname}`.split('.').toReversed().join('.')
    await using query = await beginTransaction()
    await expect(
      getPendingDescendantCleanupRootHostnames(query, rootId, [`${reversed}.leaf`]),
    ).resolves.toEqual(new Set([reversed]))
    await expect(
      getPendingDescendantCleanupRootHostnames(query, uuidv7(), [`${reversed}.leaf`]),
    ).resolves.toEqual(new Set())
    await expect(getPendingDescendantCleanupRootHostnames(query, rootId, [])).resolves.toEqual(
      new Set(),
    )
  })
})
