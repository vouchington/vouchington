import { EventEmitter } from 'node:events'
import type { QueryResult } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { observeTestAdvisoryLockNotice } from './postgres-advisory-lock-notice.mts'

function createSession(overrides: {
  version: number
  can_log: boolean
  can_set_deadlock: boolean
}) {
  const settings = {
    process_id: 12345,
    version: 180006,
    locale: 'C',
    log_lock_waits: 'off',
    deadlock_timeout: '1s',
    client_min_messages: 'warning',
    statement_timeout: '5s',
    application_name: 'owned-lock-test',
    timeout_ms: 5000,
    role_name: 'restricted-test-role',
    database_name: 'owned-test-db',
    ...overrides,
  }
  const result = {
    rows: [settings],
    fields: [],
    command: 'SELECT',
    rowCount: 1,
  } satisfies QueryResult<typeof settings>
  const query = vi
    .fn<VitestLooseMock>()
    .mockResolvedValueOnce(result)
    .mockRejectedValue(new Error('permission denied to set parameter "log_lock_waits"'))
  const client = Object.assign(new EventEmitter(), { query })
  return { client, query, settings, result }
}

describe('lock-observer prerequisites', () => {
  it.each([
    { version: 170006, can_log: true, can_set_deadlock: true },
    { version: 190000, can_log: true, can_set_deadlock: true },
    { version: 180006, can_log: false, can_set_deadlock: true },
    { version: 180006, can_log: true, can_set_deadlock: false },
  ])('keeps the prerequisite error for $version/$can_log/$can_set_deadlock', async overrides => {
    const { client, query, settings } = createSession(overrides)
    const observer = observeTestAdvisoryLockNotice(client, 'owned-lock')
    try {
      await expect(observer.ready).rejects.toThrow(
        `server_version_num=${settings.version}, current_user=${settings.role_name}, current_database()=${settings.database_name}, can_log=${settings.can_log}, can_set_deadlock=${settings.can_set_deadlock}`,
      )
      await expect(observer.ready).rejects.toThrow(/\.\/dev\/initialize backend.*DATABASE_URL/)
    } finally {
      await expect(observer.close()).resolves.toBeUndefined()
    }
    expect(query).toHaveBeenCalledTimes(1)
    expect(client.listenerCount('notice')).toBe(0)
  })

  it('still restores original settings after configuration fails', async () => {
    const { client, query, settings, result } = createSession({
      version: 180006,
      can_log: true,
      can_set_deadlock: true,
    })
    const failure = new Error('configuration failed')
    query.mockRejectedValueOnce(failure).mockResolvedValueOnce(result)
    const observer = observeTestAdvisoryLockNotice(client, 'owned-lock')
    await expect(observer.ready).rejects.toBe(failure)
    await expect(observer.close()).resolves.toBeUndefined()
    await observer.close()
    expect(query).toHaveBeenCalledTimes(3)
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [
      settings.log_lock_waits,
      settings.deadlock_timeout,
      settings.client_min_messages,
      settings.statement_timeout,
      settings.application_name,
    ])
    expect(client.listenerCount('notice')).toBe(0)
  })
})
