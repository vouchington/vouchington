import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { getFilesFromFolder } from '../../backend/data-stores/psql/migration-runner/files.mts'

export async function loadGeneratedConfigDrivenSql(
  configDrivenDir: string,
): Promise<{ file: string; sql: string }[]> {
  const generatorFiles = getFilesFromFolder(configDrivenDir)
    .filter(file => file.endsWith('.mts'))
    .toSorted()
  return Promise.all(
    generatorFiles.map(async file => {
      // no-mistakes-disable-next-line production-exports-only-used-by-tests -- runtime-resolved import boundary: loads every config-driven *.mts generator in the given directory so an unregistered SQL generator fails this check
      const mod = (await import(pathToFileURL(join(configDrivenDir, file)).href)) as {
        default?: unknown
      }
      if (typeof mod.default !== 'function')
        throw new TypeError(`${file} must export a default SQL generator`)
      const sql = await (mod.default as () => unknown)()
      if (typeof sql !== 'string') throw new TypeError(`${file} must generate SQL text`)
      return { file, sql: sql as string }
    }),
  )
}
