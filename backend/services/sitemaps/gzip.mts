import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { gunzipBytes } from '@modules/utils/compression'

const utf8Decoder = new TextDecoder()

export async function gunzipUtf8(value: Uint8Array): Promise<string> {
  return utf8Decoder.decode(await gunzipBytes(value))
}

export async function createGzipFileFromUtf8Chunks(
  chunks: Iterable<string> | AsyncIterable<string>,
): Promise<{ filePath: string; contentHash: string }> {
  const filePath = join(tmpdir(), `sitemap-${randomUUID()}.xml.gz`)
  const contentHash = await writeGzipFileFromUtf8Chunks(filePath, chunks)

  return { filePath, contentHash }
}

export async function deleteTemporaryGzipFile(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true })
  } catch {
    // Best-effort cleanup for temporary files.
  }
}

async function writeGzipFileFromUtf8Chunks(
  filePath: string,
  chunks: Iterable<string> | AsyncIterable<string>,
): Promise<string> {
  const hash = createHash('sha256')

  await pipeline(
    Readable.from(chunks, { encoding: 'utf8' }),
    createHashingTransform(hash),
    createGzip(),
    createWriteStream(filePath),
  )

  return hash.digest('hex')
}

function createHashingTransform(hash: ReturnType<typeof createHash>): Transform {
  return new Transform({
    transform(chunk, _encoding, callback): void {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
}
