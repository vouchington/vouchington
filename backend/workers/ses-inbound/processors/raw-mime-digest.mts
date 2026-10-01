import { createHash } from 'node:crypto'
import { Transform } from 'node:stream'
import type { CopyrightEmailSesVerdicts } from '@services/copyright-notices'
import { MAX_MIME_HEADER_BYTES } from './mime.mts'
import { parseSesVerdicts } from './ses-verdicts.mts'

export type SesInboundRawDigest = {
  sha256: Buffer
  byteSize: number
  sesVerdicts: CopyrightEmailSesVerdicts
}

/**
 * A pass-through stream that records the SHA-256, byte size, and SES verdicts of the original
 * message while it is read once. A header block that is oversized or unreadable yields `unknown`
 * verdicts rather than an error: `parseSesInboundMime` already owns the terminal MIME rejection.
 */
export function createRawMimeDigest(): {
  stream: Transform
  digest: Promise<SesInboundRawDigest>
} {
  const hash = createHash('sha256')
  const headerBlock = createHeaderBlockCapture()
  let byteSize = 0
  const { promise: digest, resolve, reject } = Promise.withResolvers<SesInboundRawDigest>()
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      byteSize += chunk.byteLength
      headerBlock.write(chunk)
      callback(null, chunk)
    },
  })
  stream.once('error', reject)
  stream.once('end', () =>
    resolve({
      sha256: hash.digest(),
      byteSize,
      sesVerdicts: parseSesVerdicts(headerBlock.text()),
    }),
  )
  return { stream, digest }
}

function createHeaderBlockCapture() {
  let buffered: Buffer = Buffer.alloc(0)
  let scanFrom = 0
  let state: 'open' | 'complete' | 'overflow' = 'open'
  return {
    write(chunk: Buffer): void {
      if (state !== 'open') return
      buffered = Buffer.concat([buffered, chunk])
      const end = indexOfBlankLine(buffered, scanFrom)
      if (end !== -1) {
        buffered = buffered.subarray(0, end)
        state = 'complete'
      } else if (buffered.byteLength > MAX_MIME_HEADER_BYTES) {
        buffered = Buffer.alloc(0)
        state = 'overflow'
      }
      // A blank line needs up to two bytes of lookahead, so rescan the tail once more data arrives.
      scanFrom = Math.max(0, buffered.byteLength - 2)
    },
    text(): string {
      return state === 'overflow' ? '' : buffered.toString('latin1')
    },
  }
}

/** Index of the line break ending the last header field: the first empty line (CRLF or LF). */
function indexOfBlankLine(bytes: Buffer, from: number): number {
  if (from === 0 && (bytes[0] === 0x0a || (bytes[0] === 0x0d && bytes[1] === 0x0a))) return 0
  for (let index = from; index < bytes.byteLength; index++) {
    if (bytes[index] !== 0x0a) continue
    if (bytes[index + 1] === 0x0a) return index
    if (bytes[index + 1] === 0x0d && bytes[index + 2] === 0x0a) return index
  }
  return -1
}
