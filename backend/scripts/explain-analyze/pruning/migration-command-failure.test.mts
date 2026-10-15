import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { migrationCommandFailure } from './migration-command-failure.mts'

describe('migration command failure', () => {
  it('keeps credential-bearing command causes private while preserving public failure status', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'voucha-migration-command-failure-'))
    const url = 'postgres://synthetic:fixture-secret@localhost/owned?token=fixture-token'
    const original = Object.assign(new Error(`Command failed: psql -d ${url}`), {
      code: 124,
      signal: 'SIGTERM',
      cmd: `psql -d ${url}`,
      stderr: `connection failed for ${url}`,
    })
    const errors: unknown[] = []
    try {
      const failure = await migrationCommandFailure(original, 'Owned command failed', directory, 1)
      expect(failure).not.toBe(original)
      expect(failure.cause).toEqual({ name: 'Error', code: 124, signal: 'SIGTERM' })
      const publicReport = inspect(
        new AggregateError([failure], 'Native control failed', { cause: failure }),
      )
      expect(publicReport).not.toContain('fixture-secret')
      expect(publicReport).not.toContain('fixture-token')
      expect(publicReport).not.toContain(url)
      const privatePath = join(directory, 'command-failure-1.log')
      expect(await readFile(privatePath, 'utf8')).toContain(url)
      expect((await stat(privatePath)).mode & 0o777).toBe(0o600)
      expect(original.cmd).toBe(`psql -d ${url}`)
    } catch (err) {
      errors.push(err)
    }
    try {
      await rm(directory, { force: true, recursive: true })
    } catch (err) {
      errors.push(err)
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1)
      throw new AggregateError(errors, 'Command privacy assertion and cleanup failed', {
        cause: errors[0],
      })
  })
})
