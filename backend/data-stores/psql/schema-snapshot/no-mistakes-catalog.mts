import type { Stats } from 'node:fs'
import { lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PostgresCatalog, PostgresCatalogOptions } from 'no-mistakes'
import { stableStringify } from '@modules/utils/stable-stringify'

export const NO_MISTAKES_CATALOG_FILE = 'no-mistakes-catalog.json'

/**
 * The deployed application database name. The catalog records it as `currentDatabase`, which no-mistakes
 * treats as the local database for database-qualified references. App SQL never qualifies a
 * reference, so the value changes no finding; fixing it makes a per-worktree database
 * (`voucha-<hash>`) and CI's `postgres` database generate identical bytes.
 */
export const NO_MISTAKES_CATALOG_DATABASE = 'voucha'

export const noMistakesCatalogOptions = {
  connectionEnv: 'DATABASE_URL',
  schema: 'public',
  coverage: 'complete',
  currentDatabase: NO_MISTAKES_CATALOG_DATABASE,
} as const satisfies PostgresCatalogOptions

export type CatalogFormatter = (path: string, raw: string) => Promise<string>

export function readNoMistakesCatalog(
  generate: (options: PostgresCatalogOptions) => Promise<PostgresCatalog>,
): Promise<PostgresCatalog> {
  return generate(noMistakesCatalogOptions)
}

function unsafeCatalogPath(path: string): Error {
  return new Error(`Unsafe generated PostgreSQL schema snapshot path: ${path}`)
}

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    /* v8 ignore next -- non-ENOENT stat failures are host-specific */
    throw err
  }
}

async function readExisting(root: string, path: string): Promise<string | null> {
  const rootStatus = await lstat(root)
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) throw unsafeCatalogPath(root)
  const status = await lstatOrNull(path)
  if (status === null) return null
  if (status.isSymbolicLink() || !status.isFile()) throw unsafeCatalogPath(path)
  return readFile(path, 'utf8')
}

async function replaceFile(path: string, content: string): Promise<void> {
  const temporaryDirectory = await mkdtemp(join(dirname(path), '.schema-snapshot-'))
  try {
    await writeFile(join(temporaryDirectory, 'contents'), content)
    await rename(join(temporaryDirectory, 'contents'), path)
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

export async function writeNoMistakesCatalog({
  catalog,
  root,
  format,
  check = false,
}: {
  catalog: PostgresCatalog
  root: string
  format: CatalogFormatter
  check?: boolean
}): Promise<void> {
  const path = join(root, NO_MISTAKES_CATALOG_FILE)
  const content = await format(path, stableStringify(catalog))
  const existing = await readExisting(root, path)
  if (existing === content) return
  if (!check) return replaceFile(path, content)
  throw new Error(
    'The no-mistakes PostgreSQL catalog is stale. Regenerate it against a PostgreSQL 18 database ' +
      "(matching CI's digest-pinned pgvector/pgvector:pg18 image) by running " +
      `\`pnpm run db:snapshot:update\` and commit the result:\n- ${path}`,
  )
}
