import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

class MembershipStore {
  readonly #database: DatabaseSync
  readonly #insertStatements = new Map<string, ReturnType<DatabaseSync['prepare']>>()
  #remaining: number
  #pendingWrites = 0
  readonly directory: string

  constructor(directory: string, tables: readonly string[]) {
    this.directory = directory
    this.#database = new DatabaseSync(join(directory, 'membership.sqlite'))
    this.#remaining = tables.length
    this.#database.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF')
    for (const table of tables) {
      this.#database.exec(`CREATE TABLE ${table} (value TEXT PRIMARY KEY)`)
      this.#insertStatements.set(
        table,
        this.#database.prepare(`INSERT OR IGNORE INTO ${table} (value) VALUES (?)`),
      )
    }
    this.#database.exec('BEGIN IMMEDIATE')
  }

  add(table: string, value: string): boolean {
    const statement = this.#insertStatements.get(table)
    if (!statement) throw new Error(`Unknown membership table ${table}`)
    const added = statement.run(value).changes === 1
    this.#pendingWrites += 1
    if (this.#pendingWrites === 256) this.commitBatch()
    return added
  }

  async release(): Promise<void> {
    this.#remaining -= 1
    if (this.#remaining !== 0) return
    try {
      this.#database.exec('COMMIT')
      this.#pendingWrites = 0
    } finally {
      this.#database.close()
      await rm(this.directory, { force: true, recursive: true })
    }
  }

  private commitBatch(): void {
    this.#database.exec('COMMIT; BEGIN IMMEDIATE')
    this.#pendingWrites = 0
  }
}

// Exact membership is held in one private SQLite artifact rather than one file per
// identifier. The database's unique index keeps cardinality off-heap without inode
// pressure from long-running transcripts.
export class FileBackedSet {
  #disposed = false
  readonly #store: MembershipStore
  readonly #table: string

  private constructor(store: MembershipStore, table: string) {
    this.#store = store
    this.#table = table
  }

  static async create(prefix: string, tempRoot = tmpdir()): Promise<FileBackedSet> {
    return (await FileBackedSet.createMany([prefix], tempRoot))[0]!
  }

  static async createMany(prefixes: string[], tempRoot = tmpdir()): Promise<FileBackedSet[]> {
    const tables = prefixes.map((prefix, index) => tableName(prefix, index))
    const directory = await mkdtemp(join(tempRoot, 'transcript-facts-'))
    try {
      const store = new MembershipStore(directory, tables)
      return tables.map(table => new FileBackedSet(store, table))
    } catch (error) {
      await rm(directory, { force: true, recursive: true })
      throw error
    }
  }

  async add(value: string): Promise<boolean> {
    if (this.#disposed) throw new Error('membership store has been disposed')
    return this.#store.add(this.#table, value)
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    await this.#store.release()
  }
}

function tableName(prefix: string, index: number): string {
  const normalized = prefix.replaceAll(/[^A-Za-z0-9_]/g, '_')
  return `set_${index}_${normalized || 'values'}`
}
