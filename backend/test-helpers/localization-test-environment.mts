import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCompileCli } from '../services/localization/compile-catalog.mts'
import { localizationSqlitePath } from '../services/localization/database.mts'

// Config-time setup, like the S3 buckets: backend code reads the compiled catalog, so tests compile
// the committed catalog once and every worker inherits the path.
if (!existsSync(localizationSqlitePath())) {
  const directory = mkdtempSync(join(tmpdir(), 'voucha-test-localization-'))
  process.once('exit', () => rmSync(directory, { recursive: true, force: true }))
  const output = join(directory, 'catalog.sqlite')
  await runCompileCli(['--source', 'localization/catalog', '--output', output])
  process.env.LOCALIZATION_SQLITE_PATH = output
}
