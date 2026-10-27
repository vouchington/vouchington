import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileCatalogDirectory } from '../../../backend/services/localization/compile-catalog.mts'

export async function prepareLocalizationCatalog(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'voucha-web-integration-localization-'))
  process.once('exit', () => rmSync(directory, { recursive: true, force: true }))
  process.env.LOCALIZATION_SQLITE_PATH = await compileCatalogDirectory(
    'localization/catalog',
    join(directory, 'catalog.sqlite'),
  )
}
