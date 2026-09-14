import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileLocalizationSqlite, loadCatalogDirectory } from '@vouchington/localization-compiler'

export const LOCAL_CATALOG_RELATIVE_PATH = '.local/localization/catalog.sqlite'
const WORKTREE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PACKAGE_MANIFESTS = [
  fileURLToPath(new URL('../package.json', import.meta.resolve('@vouchington/localization'))),
  fileURLToPath(
    new URL('../package.json', import.meta.resolve('@vouchington/localization-compiler')),
  ),
]

function catalogFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return catalogFiles(path)
      return entry.isFile() ? [path] : []
    })
    .sort()
}

export function catalogRevision(
  source: string,
  packageManifests: readonly string[] = PACKAGE_MANIFESTS,
): string {
  const root = resolve(source)
  const hash = createHash('sha256')
  for (const manifest of packageManifests) {
    hash.update(readFileSync(manifest))
    hash.update('\0')
  }
  for (const file of catalogFiles(root)) {
    hash.update(relative(root, file))
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function ensureLocalLocalizationCatalog({
  output = join(WORKTREE_ROOT, LOCAL_CATALOG_RELATIVE_PATH),
  source = join(WORKTREE_ROOT, 'localization/catalog'),
}: {
  output?: string
  source?: string
} = {}): Promise<string> {
  const resolvedOutput = resolve(output)
  const revisionPath = `${resolvedOutput}.revision`
  const revision = catalogRevision(source)
  if (
    existsSync(resolvedOutput) &&
    existsSync(revisionPath) &&
    readFileSync(revisionPath, 'utf8') === revision
  )
    return resolvedOutput

  mkdirSync(dirname(resolvedOutput), { recursive: true })
  const temporaryOutput = `${resolvedOutput}.${process.pid}.tmp`
  const temporaryRevision = `${revisionPath}.${process.pid}.tmp`
  const previousTmpdir = process.env.TMPDIR
  process.env.TMPDIR = dirname(resolvedOutput)
  try {
    const catalog = await loadCatalogDirectory(resolve(source))
    compileLocalizationSqlite(catalog.catalog, temporaryOutput)
    writeFileSync(temporaryRevision, revision)
    renameSync(temporaryOutput, resolvedOutput)
    renameSync(temporaryRevision, revisionPath)
  } finally {
    if (previousTmpdir === undefined) Reflect.deleteProperty(process.env, 'TMPDIR')
    else process.env.TMPDIR = previousTmpdir
    rmSync(temporaryOutput, { force: true })
    rmSync(temporaryRevision, { force: true })
  }
  return resolvedOutput
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${await ensureLocalLocalizationCatalog()}\n`)
}
