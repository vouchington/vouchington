import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileCatalogDirectory } from '../../backend/services/localization/compile-catalog.mts'
import { localizationSqlitePath } from '../../backend/services/localization/database.mts'

if (!existsSync(localizationSqlitePath())) {
  const directory = mkdtempSync(join(tmpdir(), 'voucha-playwright-localization-'))
  process.once('exit', () => rmSync(directory, { recursive: true, force: true }))
  const output = join(directory, 'catalog.sqlite')
  await compileCatalogDirectory('localization/catalog', output)
  process.env.LOCALIZATION_SQLITE_PATH = output
}

await import('../../backend/entrypoints/api/serve.mts')
