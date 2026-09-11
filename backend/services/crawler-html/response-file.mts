import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { HttpNoBodyError, HttpResponseSizeError } from '@modules/on-error/errors'
import type { CrawlerHtmlTempFile } from './types.mts'

export async function writeResponseToTemporaryFile(
  response: Response,
  url: string,
  maxSizeBytes: number,
  signal?: AbortSignal,
): Promise<CrawlerHtmlTempFile> {
  if (!response.body) throw new HttpNoBodyError(url)
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawler-html-'))
  const filePath = path.join(tempDir, 'response.html')
  let byteLength = 0
  try {
    await pipeline(
      createResponseReadable(response.body),
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          byteLength += chunk.length
          if (byteLength > maxSizeBytes) {
            callback(new HttpResponseSizeError(url, byteLength, maxSizeBytes))
            return
          }
          callback(null, chunk)
        },
      }),
      createWriteStream(filePath, { mode: 0o600 }),
      { signal },
    )
    let cleanedUp = false
    return {
      byteLength,
      cleanup: async () => {
        if (cleanedUp) return
        cleanedUp = true
        await rm(tempDir, { recursive: true, force: true })
      },
      filePath,
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

function createResponseReadable(body: ReadableStream<Uint8Array>): Readable {
  const reader = body.getReader()
  let reachedEnd = false
  let released = false
  const release = () => {
    if (released) return
    released = true
    reader.releaseLock()
  }
  return new Readable({
    read() {
      void reader.read().then(
        result => {
          if (this.destroyed) return
          if (result.done) {
            reachedEnd = true
            release()
            this.push(null)
            return
          }
          this.push(result.value)
        },
        error => this.destroy(error instanceof Error ? error : new Error(String(error))),
      )
    },
    destroy(error, callback) {
      const finish = () => {
        release()
        callback(error)
      }
      if (reachedEnd) {
        finish()
        return
      }
      cancelReader(reader, finish)
    },
  })
}

function cancelReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onComplete: () => void,
): void {
  void reader.cancel().then(onComplete, onComplete)
}
