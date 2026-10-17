import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MigrationPlatform } from '@data-stores/psql/migrate'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

/** Records only the public library boundary; it does not implement migrations or a ledger. */
export async function createMigrationPlatformFixture(
  client: Parameters<Parameters<MigrationPlatform['withMigrationSession']>[0]>[0],
) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-migration-forwarding-'))
  try {
    for (const folder of ['migrations', 'config-driven', 'views']) await mkdir(join(root, folder))
    await writeFile(join(root, 'config-driven', '9999-generated.sql'), 'SELECT 41 AS generated;')
    await writeFile(join(root, 'views', '9999-view.sql'), 'SELECT 42 AS view_phase;')
  } catch (err) {
    const errors: unknown[] = [err]
    try {
      await rm(root, { force: true, recursive: true })
    } catch (err) {
      errors.push(err)
    }
    if (errors.length > 1)
      throw new AggregateError(errors, 'Migration fixture setup and cleanup failed', { cause: err })
    throw err
  }
  const calls: { phase: string; client: unknown; input?: string; logger?: unknown }[] = []
  const fixedStarted = Promise.withResolvers<void>()
  const fixedRelease = Promise.withResolvers<void>()
  let sessions = 0
  const platform: MigrationPlatform = {
    async withMigrationSession(handler) {
      sessions += 1
      return handler(client)
    },
    async runMigrations(folder, options) {
      calls.push({
        phase: 'fixed',
        client: options?.client,
        input: folder,
        logger: options?.logger,
      })
      fixedStarted.resolve()
      await fixedRelease.promise
    },
    async write(input, _values, options) {
      calls.push({ phase: 'write', client: options?.client, input: stringFromUnknown(input) })
      return { command: '', fields: [], oid: 0, rowCount: 0, rows: [] }
    },
  }
  return {
    root,
    client,
    platform,
    calls,
    get sessions() {
      return sessions
    },
    fixedStarted: fixedStarted.promise,
    releaseFixed: () => fixedRelease.resolve(),
    close: () => rm(root, { force: true, recursive: true }),
  }
}
