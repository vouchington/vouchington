import { createReadStream } from 'node:fs'

const MAX_TRANSCRIPT_RECORD_BYTES = 2 * 1024 * 1024

export type OpenTranscriptLinesResult = { lines: AsyncIterable<string> } | { error: string }

export async function openTranscriptLines(path: string): Promise<OpenTranscriptLinesResult> {
  const stream = createReadStream(path)
  try {
    await new Promise<void>((resolve, reject) => {
      const onOpen = (): void => {
        cleanup()
        resolve()
      }
      const onError = (error: Error): void => {
        cleanup()
        reject(error)
      }
      function cleanup(): void {
        stream.removeListener('open', onOpen)
        stream.removeListener('error', onError)
      }
      stream.once('open', onOpen)
      stream.once('error', onError)
    })
    return { lines: streamTranscriptLines(stream) }
  } catch (error) {
    stream.destroy()
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function* streamTranscriptLines(
  stream: ReturnType<typeof createReadStream>,
): AsyncGenerator<string> {
  const pending: Buffer[] = []
  let pendingBytes = 0
  const line = (tail?: Buffer): string => {
    const bytes = pendingBytes + (tail?.byteLength ?? 0)
    if (bytes > MAX_TRANSCRIPT_RECORD_BYTES) {
      throw new Error(`transcript record exceeds ${MAX_TRANSCRIPT_RECORD_BYTES} byte limit`)
    }
    const value = Buffer.concat(tail ? [...pending, tail] : pending, bytes).toString('utf8')
    pending.length = 0
    pendingBytes = 0
    return value
  }
  try {
    for await (const chunk of stream) {
      let start = 0
      for (;;) {
        const newline = chunk.indexOf(10, start)
        if (newline === -1) break
        yield line(chunk.subarray(start, newline))
        start = newline + 1
      }
      if (start < chunk.byteLength) {
        const tail = chunk.subarray(start)
        pendingBytes += tail.byteLength
        if (pendingBytes > MAX_TRANSCRIPT_RECORD_BYTES) {
          throw new Error(`transcript record exceeds ${MAX_TRANSCRIPT_RECORD_BYTES} byte limit`)
        }
        pending.push(tail)
      }
    }
    yield line()
  } finally {
    stream.destroy()
  }
}
