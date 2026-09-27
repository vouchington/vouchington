import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beginTransaction } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { PostSeedDiagnostics, type SeedBackend } from './post-diagnostics.mts'

describe('post seed diagnostics', () => {
  it('persists a failed operation and samples a busy backend from another connection', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'post-seed-diagnostics-'))
    const path = join(directory, 'seed-posts.jsonl')
    const diagnostics = new PostSeedDiagnostics(path)
    try {
      try {
        await using transaction = await diagnostics.operation('begin', null, () =>
          beginTransaction(),
        )
        const { rows } = await diagnostics.operation('backend_context', null, () =>
          transaction<SeedBackend>(
            `/* postSeedDiagnosticsTestPid */ SELECT pg_backend_pid() AS pid,
                current_setting('jit') AS jit,
                current_setting('work_mem') AS work_mem,
                current_setting('plan_cache_mode') AS plan_cache_mode,
                current_setting('server_version') AS server_version`,
          ),
        )
        diagnostics.startObserver(rows[0])
        await transaction('/* postSeedDiagnosticsTestBusy */ SELECT pg_sleep(2.2)')
        await expect(
          diagnostics.operation('clearance', 7, () =>
            transaction('/* postSeedDiagnosticsTestFailure */ SELECT missing_column'),
          ),
        ).rejects.toThrow('missing_column')
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
            String(record.query).includes('pg_sleep'),
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
          }),
          expect.objectContaining({ kind: 'cumulative_end' }),
          expect.objectContaining({ kind: 'seed_end' }),
        ]),
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
