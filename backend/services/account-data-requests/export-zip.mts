import { createWriteStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import { toError } from './export-utils.mts'

type ZipDirDeps = {
  createWriteStream?: typeof createWriteStream
}

export async function zipDir(
  sourceDir: string,
  destPath: string,
  deps: ZipDirDeps = {},
): Promise<void> {
  const entries = await readdir(sourceDir, { recursive: true, withFileTypes: true })
  const zip = new ZipFile()
  const writeStream = deps.createWriteStream ?? createWriteStream
  let zipError: unknown
  zip.on('error', (err: unknown) => {
    zipError ??= err
  })
  const finished = pipeline(zip.outputStream, writeStream(destPath))

  let loopError: unknown
  try {
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const absPath = join(entry.parentPath, entry.name)
      zip.addFile(absPath, relative(sourceDir, absPath))
    }
  } catch (err) {
    loopError = err
  } finally {
    zip.end()
  }

  try {
    await finished
  } catch (err) {
    zipError ??= err
  }
  if (loopError) throw toError(loopError)
  if (zipError) throw toError(zipError)
}
