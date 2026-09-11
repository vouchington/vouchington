import { once } from 'node:events'
import type { createWriteStream } from 'node:fs'

export async function endWriteStream(
  writeStream: ReturnType<typeof createWriteStream>,
): Promise<void> {
  if (writeStream.destroyed || writeStream.closed) return

  await new Promise<void>((resolve, reject) => {
    let settled = false

    const onFinishOrClose = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const onError = (err: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }
    function cleanup() {
      writeStream.off('finish', onFinishOrClose)
      writeStream.off('close', onFinishOrClose)
      writeStream.off('error', onError)
    }

    writeStream.on('finish', onFinishOrClose)
    writeStream.on('close', onFinishOrClose)
    writeStream.on('error', onError)
    writeStream.end()
  })
}

export async function writeLineWithBackpressure(
  writeStream: NodeJS.WritableStream,
  line: string,
): Promise<void> {
  if (!writeStream.write(line)) {
    await once(writeStream, 'drain')
  }
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error('Unexpected non-Error thrown', { cause: err })
}
