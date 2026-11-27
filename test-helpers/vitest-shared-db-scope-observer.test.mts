import type { QueryExecutor } from '../backend/data-stores/psql/types.mts'
import { describe, expect, it, vi } from 'vitest'
import { sharedDbCursorScope, sharedDbIdsScope } from '@vouchington/postgres/query-telemetry'
import {
  configureTestPostgresSessions,
  FAST_TEST_STATEMENT_TIMEOUT_MS,
} from 'vouchington-tooling/shared-db-scope-guard'
import { observeSharedDbScope } from '../backend/data-stores/psql/shared-db-scope-observer.mts'
import { TEST_HNSW_EF_SEARCH } from '../backend/test-helpers/vector-search-recall-constant.mts'
import {
  sharedDbScopeGuard,
  VOUCHA_TEST_POSTGRES_SESSION_OPTIONS,
  type SharedDbScopeEvent,
} from './vitest-shared-db-scope-guard.mts'

describe('shared database scope observer', () => {
  it('leaves deliberate global production calls legal without an observer', () => {
    expect(() => observeSharedDbScope('listCopyrightStaffQueue', { kind: 'global' })).not.toThrow()
    expect(() =>
      observeSharedDbScope('searchCopyrightStaffEmailIntakes', { kind: 'global' }),
    ).not.toThrow()
    expect(() =>
      observeSharedDbScope('listAvailableNotificationPushIntents', { kind: 'global' }),
    ).not.toThrow()
    expect(() =>
      observeSharedDbScope('cleanupRetainedIdentityRoots', sharedDbIdsScope()),
    ).not.toThrow()
    expect(() =>
      observeSharedDbScope('cleanupRetainedRelationIdentities', sharedDbIdsScope()),
    ).not.toThrow()
  })

  it('registers both retained cleanup boundaries with their shared cursor tables', () => {
    const events: SharedDbScopeEvent[] = []
    const dispose = sharedDbScopeGuard.installObserver(event => events.push(event))
    try {
      observeSharedDbScope('cleanupRetainedIdentityRoots', sharedDbIdsScope(['root']))
      observeSharedDbScope('cleanupRetainedRelationIdentities', sharedDbIdsScope())
      expect(events).toEqual([
        {
          operation: 'cleanupRetainedIdentityRoots',
          table: 'retained_identity_cleanup_cursors',
          scope: { kind: 'ids', ids: ['root'] },
        },
        {
          operation: 'cleanupRetainedRelationIdentities',
          table: 'retained_relation_identity_cleanup_cursors',
          scope: { kind: 'global' },
        },
      ])
    } finally {
      dispose()
    }
  })

  it('reports bound ids and keyset cursors to a registered observer', () => {
    const events: SharedDbScopeEvent[] = []
    const dispose = sharedDbScopeGuard.installObserver(event => events.push(event))
    try {
      observeSharedDbScope(
        'listRecoverableMediaDeliveryRegistryIds',
        sharedDbIdsScope(['record-id']),
      )
      observeSharedDbScope('listCopyrightStaffQueue', sharedDbCursorScope('cursor-id'))
      expect(events).toEqual([
        {
          operation: 'listRecoverableMediaDeliveryRegistryIds',
          table: 'media_delivery_registry_records',
          scope: { kind: 'ids', ids: ['record-id'] },
        },
        {
          operation: 'listCopyrightStaffQueue',
          table: 'copyright_notices',
          scope: { kind: 'cursor', id: 'cursor-id' },
        },
      ])
    } finally {
      dispose()
    }
  })

  it('keeps the observer installed across module re-evaluation', async () => {
    const events: SharedDbScopeEvent[] = []
    const dispose = sharedDbScopeGuard.installObserver(event => events.push(event))
    try {
      vi.resetModules()
      const fresh = await import('../backend/data-stores/psql/shared-db-scope-observer.mts')
      fresh.observeSharedDbScope('getRecoverableOAuthAuthorizationIds', { kind: 'global' })
      expect(events).toMatchObject([{ operation: 'getRecoverableOAuthAuthorizationIds' }])
    } finally {
      dispose()
    }
  })
})

describe('Voucha shared database scope policy wiring', () => {
  it('preserves explicit ID admission for staff email intakes without requiring a keyset', () => {
    expect(() =>
      sharedDbScopeGuard.rejectUnscopedCall({
        operation: 'searchCopyrightStaffEmailIntakes',
        table: 'copyright_notice_email_intakes',
        scope: { kind: 'ids', ids: ['00000000-0000-0000-0000-000000000002'] },
      }),
    ).not.toThrow()
  })

  it('admits cleanupRetainedRelationIdentities only for the reserved transaction and survives resetModules', async () => {
    const query: QueryExecutor = async () => {
      throw new Error('Boundary test must not execute SQL')
    }
    const event: SharedDbScopeEvent = {
      operation: 'cleanupRetainedRelationIdentities',
      table: 'retained_relation_identity_cleanup_cursors',
      scope: { kind: 'global' },
      transaction: query,
    }
    const testPath = expect.getState().testPath!
    const close = sharedDbScopeGuard.registerTransactionReservation(query)
    try {
      expect(() => sharedDbScopeGuard.rejectUnscopedCall(event)).not.toThrow()
      expect(() =>
        sharedDbScopeGuard.rejectUnscopedCall({
          ...event,
          operation: 'cleanupRetainedIdentityRoots',
          table: 'retained_identity_cleanup_cursors',
        }),
      ).toThrow('requires')

      vi.resetModules()
      const fresh = await import('./vitest-shared-db-scope-guard.mts')
      expect(() => fresh.sharedDbScopeGuard.rejectUnscopedCall(event)).not.toThrow()
    } finally {
      close()
      sharedDbScopeGuard.markViolationsReported(testPath)
    }
  })

  it('applies Voucha test PostgreSQL session options including hnsw.ef_search', () => {
    const env = {
      DATABASE_URL: 'postgres://localhost/owned',
      READ_DATABASE_URL: 'postgres://localhost/owned_read',
    }
    configureTestPostgresSessions(env, VOUCHA_TEST_POSTGRES_SESSION_OPTIONS)
    for (const key of ['DATABASE_URL', 'READ_DATABASE_URL'] as const) {
      const options = new URL(env[key]).searchParams.get('options')
      expect(options).toContain(`-c statement_timeout=${FAST_TEST_STATEMENT_TIMEOUT_MS}`)
      expect(options).toContain(`-c hnsw.ef_search=${TEST_HNSW_EF_SEARCH}`)
    }
  })
})
