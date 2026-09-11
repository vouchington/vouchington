export interface CommandResult {
  stdout: string
}

export type CommandRunner = (file: string, args: string[]) => Promise<CommandResult>
export interface BenchmarkDatabase {
  drop: () => Promise<void>
}

interface BenchmarkCleanupDependencies {
  closePools: () => Promise<void>
  getDatabase: () => { drop: () => Promise<void> } | undefined
  waitForDatabaseCreation?: () => Promise<void>
}

export function createBenchmarkCleanup({
  closePools,
  getDatabase,
  waitForDatabaseCreation = async () => {},
}: BenchmarkCleanupDependencies): () => Promise<void> {
  let completion: Promise<void> | undefined
  return () => {
    completion ??= (async () => {
      try {
        await closePools()
      } finally {
        await waitForDatabaseCreation()
        await getDatabase()?.drop()
      }
    })()
    return completion
  }
}

export async function createFreshBenchmarkDatabase(
  run: CommandRunner,
  sourceDatabaseUrl: string,
  databaseName: string,
  onCreated?: (database: BenchmarkDatabase) => void,
): Promise<BenchmarkDatabase> {
  const found = await run('psql', [
    '-d',
    sourceDatabaseUrl,
    '-Atqc',
    `SELECT 1 FROM pg_database WHERE datname = '${quoteLiteral(databaseName)}'`,
  ])
  if (found.stdout.trim()) {
    throw new Error(`refusing existing benchmark database ${databaseName}`)
  }

  await run('createdb', ['--', databaseName])
  let dropped = false
  const database = {
    async drop() {
      if (dropped) return
      dropped = true
      await run('dropdb', ['--if-exists', '--', databaseName])
    },
  }
  try {
    onCreated?.(database)
  } catch (error) {
    await database.drop()
    throw error
  }
  return database
}

export function databaseUrlWithName(databaseUrl: string, name: string): string {
  const parsed = new URL(databaseUrl)
  parsed.pathname = `/${name}`
  parsed.searchParams.delete('dbname')
  return parsed.toString()
}

function quoteLiteral(value: string): string {
  return value.replaceAll("'", "''")
}
