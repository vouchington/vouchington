import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCompileCli } from '../../backend/services/localization/compile-catalog.mts'
import { localizationSqlitePath } from '../../backend/services/localization/database.mts'
import { startFakeBedrockRuntime } from './fake-bedrock-runtime.mts'

if (!existsSync(localizationSqlitePath())) {
  const directory = mkdtempSync(join(tmpdir(), 'voucha-playwright-localization-'))
  process.once('exit', () => rmSync(directory, { recursive: true, force: true }))
  const output = join(directory, 'catalog.sqlite')
  await runCompileCli(['--source', 'localization/catalog', '--output', output])
  process.env.LOCALIZATION_SQLITE_PATH = output
}

// The credentialed project carries real AWS credentials and keeps calling real Bedrock.
if (!process.env.AWS_ACCESS_KEY_ID && !process.env.BEDROCK_AWS_ACCESS_KEY_ID) {
  process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME = await startFakeBedrockRuntime()
  process.env.BEDROCK_AWS_ACCESS_KEY_ID = 'playwright-fake-bedrock-access-key-id'
  process.env.BEDROCK_AWS_SECRET_ACCESS_KEY = 'playwright-fake-bedrock-secret-access-key'
}

await import('../../backend/entrypoints/api/serve.mts')
