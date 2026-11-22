import { randomBytes } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  beginTransaction,
  createTestUser,
  getTestPenaltiesByHostnameId,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { blockHostname } from './block-hostname.mts'
import {
  getHostnameBlockCleanupOperationInTransaction,
  lockHostnameBlockCleanupOperation,
} from './cleanup-operation.mts'
import { advanceHostnameBlockCleanupProgress } from './cleanup-operation-progress.mts'
import { projectNextHostnameBlockSubdomainPage } from './cleanup-subdomains.mts'
import { lockHostnameBlockSubdomainCandidatePage } from './lock-subdomain-candidate-page.mts'
import { insertVoteWeightPenalty } from '@services/vote-integrity/insert-vote-weight-penalty'

describe('hostname block lock ordering', () => {
  it('preserves the root and penalty provenance during repeat admission', async () => {
    const [administrator, creator] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ username: `hostname-lock-creator-${randomToken()}` }),
    ])
    const hostnameId = await insertTestUrlHostname({ hostname: randomHostname('penalty-fk') })
    const admission = await blockHostname(administrator.id, hostnameId)

    await using cleanupTransaction = await beginTransaction()
    const operation = await lockHostnameBlockCleanupOperation(
      cleanupTransaction,
      admission.operation_id,
    )
    expect(operation).not.toBeNull()

    await using blockTransaction = await beginTransaction()
    const hostnameUpdateDispatched = Promise.withResolvers<void>()
    const barrieredBlockQuery = queryProxy(blockTransaction, statement => {
      if (statement.includes('/* blockHostname_introduceTarget */')) {
        hostnameUpdateDispatched.resolve()
      }
    })
    const repeatedBlock = blockHostname(administrator.id, hostnameId, {
      query: barrieredBlockQuery,
    })
    await hostnameUpdateDispatched.promise

    await expect(
      advanceHostnameBlockCleanupProgress(cleanupTransaction, admission.operation_id, 0),
    ).resolves.toMatchObject({ progress: 1 })
    await expect(
      insertVoteWeightPenalty({
        userIds: [creator.id],
        reason: 'blocked_hostname',
        sourceHostnameId: hostnameId,
        sourceHostnameBlockId: admission.operation_id,
        createdById: administrator.id,
        enqueueRecalculation: false,
        query: cleanupTransaction,
      }),
    ).resolves.toEqual([creator.id])
    await cleanupTransaction.commit()

    await expect(repeatedBlock).resolves.toEqual(admission)
    await blockTransaction.commit()
    await expect(getTestPenaltiesByHostnameId(hostnameId)).resolves.toHaveLength(1)
  })

  it('preserves cleanup ownership when a direct child block overlaps projection', async () => {
    const administrator = await createTestUser({ administrator: true })
    const rootHostname = randomHostname('child-order')
    const [rootId, childId] = await Promise.all([
      insertTestUrlHostname({ hostname: rootHostname }),
      insertTestUrlHostname({ hostname: `child.${rootHostname}` }),
    ])
    const admission = await blockHostname(administrator.id, rootId)
    const initialProjection = await projectNextHostnameBlockSubdomainPage(
      admission.operation_id,
      0,
      undefined,
      10,
    )

    await using projectionTransaction = await beginTransaction()
    const operation = await getHostnameBlockCleanupOperationInTransaction(
      projectionTransaction,
      admission.operation_id,
    )
    const { candidates } = await lockHostnameBlockSubdomainCandidatePage(
      projectionTransaction,
      operation!,
      undefined,
      10,
    )
    expect(candidates.map(candidate => candidate.id)).toContain(childId)

    await using childTransaction = await beginTransaction()
    const childUpdateDispatched = Promise.withResolvers<void>()
    const barrieredChildQuery = queryProxy(childTransaction, statement => {
      if (statement.includes('/* blockHostname_introduceTarget */')) {
        childUpdateDispatched.resolve()
      }
    })
    const childBlock = blockHostname(administrator.id, childId, { query: barrieredChildQuery })
    await childUpdateDispatched.promise

    await expect(
      lockHostnameBlockCleanupOperation(projectionTransaction, admission.operation_id),
    ).resolves.toMatchObject({ progress: initialProjection.operation!.progress })
    await projectionTransaction.commit()

    await expect(childBlock).resolves.toEqual(
      expect.objectContaining({ operation_id: admission.operation_id }),
    )
    await childTransaction.commit()
  })
})

function queryProxy(
  query: TransactionQuery,
  beforeQuery: (statement: string) => void,
): TransactionQuery {
  return new Proxy(query, {
    apply(target, thisArgument, argumentsList: Parameters<TransactionQuery>) {
      const input = argumentsList[0]
      beforeQuery(typeof input === 'string' ? input : input.text)
      return Reflect.apply(target, thisArgument, argumentsList)
    },
  })
}

function randomHostname(suffix: string): string {
  return `hostname-lock-${suffix}-${randomToken()}.example.com`
}

function randomToken(): string {
  return randomBytes(6).toString('hex')
}
