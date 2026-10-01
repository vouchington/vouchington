import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createRawMimeDigest } from './raw-mime-digest.mts'
import { MAX_MIME_HEADER_BYTES } from './mime.mts'

const HEADERS = [
  'X-SES-Spam-Verdict: PASS',
  'X-SES-Virus-Verdict: FAIL',
  'Authentication-Results: amazonses.com; spf=pass; dkim=fail; dmarc=none;',
  'X-SES-RECEIPT: abc',
  'From: sender@example.org',
]
const EXPECTED = { spf: 'pass', dkim: 'fail', dmarc: 'gray', spam: 'pass', virus: 'fail' }

async function digestOf(chunks: Buffer[]) {
  const { stream, digest } = createRawMimeDigest()
  Readable.from(chunks, { objectMode: false }).pipe(stream)
  stream.resume()
  return digest
}

function bytesOf(eol: string, body = 'Body text'): Buffer {
  return Buffer.from(`${HEADERS.join(eol)}${eol}${eol}${body}`)
}

describe('createRawMimeDigest', () => {
  it('hashes and counts every byte while reading the SES verdicts', async () => {
    const raw = bytesOf('\r\n')
    await expect(digestOf([raw])).resolves.toEqual({
      sha256: createHash('sha256').update(raw).digest(),
      byteSize: raw.byteLength,
      sesVerdicts: EXPECTED,
    })
  })

  it('finds the end of the header block when the separator spans chunks', async () => {
    for (const eol of ['\r\n', '\n']) {
      const raw = bytesOf(eol)
      const oneByteAtATime = Array.from({ length: raw.byteLength }, (_, index) =>
        raw.subarray(index, index + 1),
      )
      const result = await digestOf(oneByteAtATime)
      expect(result.sesVerdicts).toEqual(EXPECTED)
      expect(result.sha256).toEqual(createHash('sha256').update(raw).digest())
      expect(result.byteSize).toBe(raw.byteLength)
    }
  })

  it('does not read verdict-looking lines from the message body', async () => {
    const raw = bytesOf('\r\n', 'X-SES-Spam-Verdict: FAIL\r\nX-SES-RECEIPT: forged')
    expect((await digestOf([raw])).sesVerdicts).toEqual(EXPECTED)
  })

  it('reports unknown verdicts without failing when the header block never ends', async () => {
    const raw = Buffer.from(`${HEADERS.join('\r\n')}\r\n`)
    const result = await digestOf([raw])
    expect(result.sesVerdicts).toEqual(EXPECTED)
    expect(result.byteSize).toBe(raw.byteLength)
  })

  it('reports unknown verdicts without failing when the header block exceeds the cap', async () => {
    const filler = Buffer.from(`X-Filler: ${'a'.repeat(MAX_MIME_HEADER_BYTES)}\r\n`)
    const raw = Buffer.concat([filler, bytesOf('\r\n')])
    const result = await digestOf([filler, bytesOf('\r\n')])
    expect(result.sesVerdicts).toEqual({
      spf: 'unknown',
      dkim: 'unknown',
      dmarc: 'unknown',
      spam: 'unknown',
      virus: 'unknown',
    })
    expect(result.sha256).toEqual(createHash('sha256').update(raw).digest())
    expect(result.byteSize).toBe(raw.byteLength)
  })

  it('rejects the digest when the source stream fails', async () => {
    const { stream, digest } = createRawMimeDigest()
    const failure = new Error('socket reset')
    stream.resume()
    stream.destroy(failure)
    await expect(digest).rejects.toBe(failure)
  })
})
