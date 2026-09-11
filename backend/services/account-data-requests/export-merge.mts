import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { endWriteStream, toError, writeLineWithBackpressure } from './export-utils.mts'

export async function mergeCsvFiles(
  outPath: string,
  tempFiles: string[],
  fallbackHeader: string,
): Promise<void> {
  const writeStream = createWriteStream(outPath)
  let mergeError: unknown
  let endError: unknown

  try {
    const headerWritten = await mergeCsvFileList(writeStream, tempFiles)
    if (!headerWritten) {
      await writeLineWithBackpressure(writeStream, fallbackHeader)
    }
  } catch (err) {
    mergeError = err
  } finally {
    try {
      await endWriteStream(writeStream)
    } catch (endErr) {
      endError = endErr
    }
  }

  if (mergeError) throw toError(mergeError)
  if (endError) throw toError(endError)
}

function mergeCsvFileList(writeStream: NodeJS.WritableStream, tempFiles: string[]) {
  return tempFiles.reduce(
    (prev, filePath) =>
      prev.then(headerWritten => mergeCsvFile(writeStream, filePath, headerWritten)),
    Promise.resolve(false),
  )
}

async function mergeCsvFile(
  writeStream: NodeJS.WritableStream,
  filePath: string,
  headerWritten: boolean,
) {
  try {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    return await mergeCsvLines(writeStream, rl, headerWritten)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    return headerWritten
  }
}

async function mergeCsvLines(
  writeStream: NodeJS.WritableStream,
  lines: AsyncIterable<string>,
  headerWritten: boolean,
) {
  const state = { headerWritten, isFirstLine: true }
  for await (const line of lines) {
    if (!line.trim()) continue
    if (state.isFirstLine) {
      state.isFirstLine = false
      if (state.headerWritten) continue
      state.headerWritten = true
    }
    await writeLineWithBackpressure(writeStream, `${line}\n`)
  }
  return state.headerWritten
}
