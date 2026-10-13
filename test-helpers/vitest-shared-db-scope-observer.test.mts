import type { QueryExecutor } from '../backend/data-stores/psql/types.mts'
import {
  registerRetainedRelationCleanupReservation,
  rejectUnscopedSharedDbCall,
  markSharedDbScopeViolationsReported,
} from './vitest-shared-db-scope-violations.mts'
import { describe, expect, it, vi } from 'vitest'
import {
  observeSharedDbScope,
  sharedDbCursorScope,
  sharedDbIdsScope,
  type SharedDbScopeEvent,
} from '../backend/data-stores/psql/shared-db-scope-observer.mts'
import { installSharedDbScopeObserver } from './vitest-shared-db-scope-observer.mts'

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
    const dispose = installSharedDbScopeObserver(event => events.push(event))
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
    const dispose = installSharedDbScopeObserver(event => events.push(event))
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
    const dispose = installSharedDbScopeObserver(event => events.push(event))
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

describe('retained relation transaction admission', () => {
  it('admits only the registered executor, operation, test and active lifetime', () => {
    const query: QueryExecutor = async () => {
      throw new Error('Boundary test must not execute SQL')
    }
    const other: QueryExecutor = async () => {
      throw new Error('Boundary test must not execute SQL')
    }
    const event: SharedDbScopeEvent = {
      operation: 'cleanupRetainedRelationIdentities',
      table: 'retained_relation_identity_cleanup_cursors',
      scope: { kind: 'global' },
      transaction: query,
    }
    const state = { ...expect.getState() }
    const close = registerRetainedRelationCleanupReservation(query)
    try {
      expect(() => rejectUnscopedSharedDbCall(event)).not.toThrow()
      expect(() => registerRetainedRelationCleanupReservation(query)).toThrow(
        'one active test transaction',
      )
      expect(() => rejectUnscopedSharedDbCall({ ...event, transaction: other })).toThrow('requires')
      expect(() => rejectUnscopedSharedDbCall({ ...event, transaction: undefined })).toThrow(
        'requires',
      )
      expect(() =>
        rejectUnscopedSharedDbCall({
          ...event,
          operation: 'cleanupRetainedIdentityRoots',
          table: 'retained_identity_cleanup_cursors',
        }),
      ).toThrow('requires')
      expect.setState({ currentTestName: `${state.currentTestName}:different` })
      expect(() => rejectUnscopedSharedDbCall(event)).toThrow('requires')
      expect.setState({ currentTestName: undefined })
      expect(() => rejectUnscopedSharedDbCall({ ...event, transaction: other })).toThrow('requires')
      expect(() => rejectUnscopedSharedDbCall(event)).toThrow('requires')
      expect(() => registerRetainedRelationCleanupReservation(other)).toThrow(
        'one active test transaction',
      )
      expect.setState({ currentTestName: state.currentTestName })
      close()
      close()
      expect(() => rejectUnscopedSharedDbCall(event)).toThrow('requires')
      const nextClose = registerRetainedRelationCleanupReservation(query)
      try {
        close()
        expect(() => rejectUnscopedSharedDbCall(event)).not.toThrow()
      } finally {
        nextClose()
      }
    } finally {
      expect.setState({ currentTestName: state.currentTestName })
      close()
      markSharedDbScopeViolationsReported(state.testPath!)
    }
  })

  it('preserves active admission across module re-evaluation', async () => {
    const query: QueryExecutor = async () => {
      throw new Error('Boundary test must not execute SQL')
    }
    const close = registerRetainedRelationCleanupReservation(query)
    try {
      vi.resetModules()
      const fresh = await import('./vitest-shared-db-scope-violations.mts')
      expect(() =>
        fresh.rejectUnscopedSharedDbCall({
          operation: 'cleanupRetainedRelationIdentities',
          table: 'retained_relation_identity_cleanup_cursors',
          scope: { kind: 'global' },
          transaction: query,
        }),
      ).not.toThrow()
      expect(() => fresh.registerRetainedRelationCleanupReservation(query)).toThrow(
        'one active test transaction',
      )
    } finally {
      close()
    }
  })
})
