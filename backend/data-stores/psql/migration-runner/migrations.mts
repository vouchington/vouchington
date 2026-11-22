import path from 'node:path'
import { runConfigDriven as runPlatformConfigDriven } from '@vouchington/postgres'
import onError from '@modules/on-error'
import { beginTransaction } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { readCanonicalConfigDrivenGenerator } from './config-driven-generators.mts'
import { readMigrationFile } from './files.mts'
import type { MigrationLogger } from './migration-logger.mts'

export { type MigrationLogger } from './migration-logger.mts'

export interface RunConfigDrivenOptions {
  folder?: string
  logger?: MigrationLogger
  writer?: QueryExecutor
}

export async function runConfigDriven(rootDir: string, options: RunConfigDrivenOptions = {}) {
  const folder = options.folder ?? path.resolve(rootDir, 'config-driven')
  const isCanonicalFolder =
    path.resolve(folder) === path.resolve(import.meta.dirname, '../config-driven')
  await runPlatformConfigDriven(folder, {
    target: options.writer ? { writer: options.writer } : { beginTransaction },
    reportError: onError,
    readFile: (readFolder, file) =>
      isCanonicalFolder && file.endsWith('.mts')
        ? readCanonicalConfigDrivenGenerator(file)
        : readMigrationFile(readFolder, file),
    ...(options.logger && { logger: options.logger }),
  })
}
