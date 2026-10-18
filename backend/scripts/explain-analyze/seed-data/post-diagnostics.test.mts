import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beginTransaction } from '@voucha/test-helpers'
import {
  getPostSeedDiagnosticsBackend,
  getPostSeedDiagnosticsBlockerPid,
  holdPostSeedDiagnosticsLock,
  rejectPostSeedDiagnosticsOperation,
  tryPostSeedDiagnosticsLock,
  waitForPostSeedDiagnosticsLock,
} from '@voucha/test-helpers/post-seed-diagnostics'
import { describe, expect, it, vi } from 'vitest'
import { PostSeedDiagnostics } from './post-diagnostics.mts'

describe('post seed diagnostics', () => {
  it('persists a failed operation and samples a lock-blocked backend from another connection', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'post-seed-diagnostics-'))
    const path = join(directory, 'seed-posts.jsonl')
    const diagnostics = new PostSeedDiagnostics(path)
    const lockKey = randomUUID()
    const observedLockWait = Promise.withResolvers<void>()
    const observation = observedLockWait.promise.then(
      () => ({ status: 'fulfilled' as const }),
      err => ({ status: 'rejected' as const, error: asError(err) }),
    )
    const writeSpy = vi.spyOn(diagnostics, 'write').mockImplementation(record => {
      PostSeedDiagnostics.prototype.write.call(diagnostics, record)
      if (
        record.kind === 'activity' &&
        record.wait_event_type === 'Lock' &&
        String(record.query).includes('postSeedDiagnosticsTestBlocked')
      ) {
        observedLockWait.resolve()
      }
      if (record.kind === 'observer_error') observedLockWait.reject(new Error(String(record.error)))
    })
    try {
      await using blocker = await beginTransaction()
      const blockerPid = await getPostSeedDiagnosticsBlockerPid(blocker)
      await holdPostSeedDiagnosticsLock(blocker, lockKey)
      try {
        await using transaction = await diagnostics.operation('begin', null, () =>
          beginTransaction(),
        )
        const backendContext = await diagnostics.operation('backend_context', null, () =>
          getPostSeedDiagnosticsBackend(transaction),
        )
        diagnostics.startObserver(backendContext)
        expect(await tryPostSeedDiagnosticsLock(transaction, lockKey)).toBe(false)
        const blocked = waitForPostSeedDiagnosticsLock(transaction, lockKey).then(
          () => ({ status: 'fulfilled' as const }),
          err => ({ status: 'rejected' as const, error: asError(err) }),
        )
        let observationError: Error | undefined
        try {
          await Promise.race([
            observation.then(result => {
              if (result.status === 'rejected') throw result.error
              return undefined
            }),
            blocked.then(result => {
              if (result.status === 'rejected') throw result.error
              throw new Error('Lock acquisition completed before observer sampled it')
            }),
          ])
        } catch (err) {
          observationError = asError(err)
        }
        await blocker.rollback()
        const blockedResult = await blocked
        if (observationError !== undefined) throw observationError
        if (blockedResult.status === 'rejected') throw blockedResult.error
        await expect(
          diagnostics.operation('clearance', 7, () =>
            rejectPostSeedDiagnosticsOperation(transaction),
          ),
        ).rejects.toThrow('Injected post-seed diagnostics failure')
        await expect(getPostSeedDiagnosticsBackend(transaction)).resolves.toEqual(backendContext)
      } finally {
        await diagnostics.stop()
      }
      const records = readFileSync(path, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>)
      const connected = records.find(record => record.kind === 'observer_connected')
      const backend = records.find(record => record.kind === 'backend')
      expect(records[0].kind).toBe('seed_start')
      expect(connected?.observer_pid).not.toBe(backend?.backend_pid)
      expect(
        records.some(
          record =>
            record.kind === 'activity' &&
            record.backend_pid === backend?.backend_pid &&
            record.wait_event_type === 'Lock' &&
            Array.isArray(record.blockers) &&
            record.blockers.includes(blockerPid) &&
            String(record.query).includes('postSeedDiagnosticsTestBlocked'),
        ),
      ).toBe(true)
      expect(records).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'operation',
            phase: 'begin',
            name: 'backend_context',
          }),
          expect.objectContaining({
            kind: 'operation',
            phase: 'end',
            name: 'backend_context',
            status: 'ok',
          }),
          expect.objectContaining({
            kind: 'operation',
            phase: 'begin',
            name: 'clearance',
            batch_index: 7,
          }),
          expect.objectContaining({
            kind: 'operation',
            phase: 'end',
            name: 'clearance',
            batch_index: 7,
            status: 'error',
            error: 'Error: Injected post-seed diagnostics failure',
          }),
          expect.objectContaining({ kind: 'cumulative_end' }),
          expect.objectContaining({ kind: 'seed_end' }),
        ]),
      )
    } finally {
      writeSpy.mockRestore()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
