import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ensureCompiledLocalizationCatalog } from '@vouchington/localization-compiler'

export const LOCAL_CATALOG_RELATIVE_PATH = '.local/localization/catalog.sqlite'
const WORKTREE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PACKAGE_MANIFESTS = [
  fileURLToPath(new URL('../package.json', import.meta.resolve('@vouchington/localization'))),
  fileURLToPath(
    new URL('../package.json', import.meta.resolve('@vouchington/localization-compiler')),
  ),
]

export function localCatalogPaths(worktreeRoot: string = WORKTREE_ROOT) {
  return {
    output: join(resolve(worktreeRoot), LOCAL_CATALOG_RELATIVE_PATH),
    source: join(resolve(worktreeRoot), 'localization/catalog'),
  }
}

export async function ensureLocalLocalizationCatalog({
  output = join(WORKTREE_ROOT, LOCAL_CATALOG_RELATIVE_PATH),
  source = join(WORKTREE_ROOT, 'localization/catalog'),
}: {
  output?: string
  source?: string
} = {}): Promise<string> {
  return ensureCompiledLocalizationCatalog({
    output,
    source,
    extraHashFiles: PACKAGE_MANIFESTS,
  })
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { 'worktree-root': { type: 'string' } } })
  process.stdout.write(
    `${await ensureLocalLocalizationCatalog(localCatalogPaths(values['worktree-root']))}\n`,
  )
}
