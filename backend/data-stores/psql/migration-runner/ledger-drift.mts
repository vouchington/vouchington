import {
  computeMigrationChecksum,
  getFilesFromFolder,
  readMigrationFile,
} from '@vouchington/postgres'

type LedgerMigration = {
  checksum: string
  id: string
}

function parseLedger(input: string): LedgerMigration[] {
  return input
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [id, checksum = ''] = line.split('\t')
      return { id, checksum }
    })
}

export async function findMigrationLedgerDrift(
  migrationsDirectory: string,
  ledger: readonly LedgerMigration[],
): Promise<string | undefined> {
  const files = new Set(getFilesFromFolder(migrationsDirectory))
  const checksums = new Map(
    await Promise.all(
      ledger.flatMap(({ id, checksum }) => {
        if (!files.has(id) || !checksum) return []
        return [
          readMigrationFile(migrationsDirectory, id).then(sql => [
            id,
            computeMigrationChecksum(sql),
          ]),
        ]
      }),
    ),
  )

  for (const { id, checksum } of ledger) {
    if (!files.has(id)) continue
    if (!checksum) return `applied migration ${id} is missing its checksum`

    if (checksums.get(id) !== checksum) {
      return `applied migration ${id} has a checksum that differs from its local file`
    }
  }
}

if (import.meta.main) {
  const [migrationsDirectory] = process.argv.slice(2)
  if (!migrationsDirectory) throw new TypeError('Expected a migrations directory argument')

  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) input += chunk

  const drift = await findMigrationLedgerDrift(migrationsDirectory, parseLedger(input))
  if (drift) process.stdout.write(`${drift}\n`)
}
