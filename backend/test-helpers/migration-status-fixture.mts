import { randomUUID } from 'node:crypto'
import fs, { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { onTestFinished, vi, type MockInstance } from 'vitest'
import { write } from '@data-stores/psql'

const MIGRATIONS_DIRECTORY = path.resolve(import.meta.dirname, '../data-stores/psql/migrations')
const PENDING_MIGRATION = 'm25-owned-pending.mts'

/** Redirect only the status reader's canonical migration directory to owned finite files. */
export async function createMigrationStatusFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'voucha-migration-status-'))
  const appliedMigration = `m25-owned-applied-${randomUUID()}.sql`
  let readdirSpy: MockInstance<typeof fs.readdir> | undefined
  let failNextRead: Error | undefined

  onTestFinished(async () => {
    readdirSpy?.mockRestore()
    try {
      await write('/* deleteOwnedMigrationStatusFixture */ DELETE FROM migrations WHERE id = $1', [
        appliedMigration,
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  await writeFile(path.join(root, appliedMigration), '-- owned applied migration')
  await writeFile(path.join(root, PENDING_MIGRATION), '-- owned pending migration')
  await writeFile(path.join(root, '.m25-owned-hidden.sql'), '-- ignored hidden file')
  await writeFile(path.join(root, 'm25-owned-ignored.txt'), 'ignored extension')
  await write(
    '/* insertOwnedMigrationStatusFixture */ INSERT INTO migrations (id, checksum) VALUES ($1, $2)',
    [appliedMigration, 'm25-owned-test-checksum'],
  )

  const originalReaddir = fs.readdir
  readdirSpy = vi.spyOn(fs, 'readdir').mockImplementation(async (...args) => {
    if (path.resolve(String(args[0])) === MIGRATIONS_DIRECTORY) {
      if (failNextRead) {
        const error = failNextRead
        failNextRead = undefined
        throw error
      }
      args[0] = root
    }
    return originalReaddir(...args)
  })

  return {
    failNextRead(error: Error) {
      failNextRead = error
    },
  }
}
