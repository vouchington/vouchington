import { createHash } from 'node:crypto'

import {
  getFilesFromFolder,
  readMigrationFile,
} from '../../backend/data-stores/psql/migration-runner/files.mts'

type LedgerMigration = {
  checksum: string
  id: string
}

export function parseMigrationLedger(input: string): LedgerMigration[] {
  return input
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [id, checksum = ''] = line.split('\t')
      return { id, checksum }
    })
}

function checksum(sql: string) {
  return createHash('sha256').update(sql, 'utf8').digest('hex')
}

export async function findMigrationLedgerDrift(
  migrationsDirectory: string,
  ledger: readonly LedgerMigration[],
): Promise<string | undefined> {
  const migrationFiles = new Set(getFilesFromFolder(migrationsDirectory))
  const currentChecksums = new Map(
    await Promise.all(
      ledger.flatMap(({ id, checksum: recordedChecksum }) => {
        if (!migrationFiles.has(id) || !recordedChecksum) return []
        return [
          readMigrationFile(migrationsDirectory, id).then(sql => [id, checksum(sql)] as const),
        ]
      }),
    ),
  )

  for (const { id, checksum: recordedChecksum } of ledger) {
    if (!migrationFiles.has(id)) continue
    if (!recordedChecksum) return `applied migration ${id} is missing its checksum`

    if (currentChecksums.get(id) !== recordedChecksum) {
      return `applied migration ${id} has a checksum that differs from its local file`
    }
  }

  return undefined
}

/* c8 ignore next -- CLI entrypoint is covered by dev initializer shell tests. */
if (import.meta.main) {
  const [migrationsDirectory] = process.argv.slice(2)
  if (!migrationsDirectory) throw new TypeError('Expected a migrations directory argument')

  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) input += chunk

  const drift = await findMigrationLedgerDrift(migrationsDirectory, parseMigrationLedger(input))
  if (drift) process.stdout.write(`${drift}\n`)
}
