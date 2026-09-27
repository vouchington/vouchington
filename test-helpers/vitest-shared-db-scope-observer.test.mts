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
  })

  it('reports bound ids and keyset cursors to a registered observer', () => {
    const events: SharedDbScopeEvent[] = []
    const dispose = installSharedDbScopeObserver(event => events.push(event))
    try {
      observeSharedDbScope('listRecoverableMediaDeliveryRegistryKeys', sharedDbIdsScope(['key']))
      observeSharedDbScope('listCopyrightStaffQueue', sharedDbCursorScope('cursor-id'))
      expect(events).toEqual([
        {
          operation: 'listRecoverableMediaDeliveryRegistryKeys',
          table: 'media_delivery_registry_records',
          scope: { kind: 'ids', ids: ['key'] },
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
