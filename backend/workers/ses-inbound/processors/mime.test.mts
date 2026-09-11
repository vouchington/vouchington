import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { parseSesInboundMime, SesInboundTerminalError } from './mime.mts'
import { MAX_MIME_TEXT_BYTES } from './streamed-mail-parts.mts'

describe('SES inbound MIME parsing', () => {
  it('extracts sender, subject, body, and reply references', async () => {
    const raw = Buffer.from(
      [
        'From: "Ada Lovelace" <tests+ada@voucha.ai>',
        'To: support@voucha.ai',
        'Subject: Help with my account',
        'Message-ID: <tests+incoming@voucha.ai>',
        'In-Reply-To: <tests+reply@voucha.ai>',
        'References: <tests+first@voucha.ai> <tests+reply@voucha.ai>',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Please help.',
      ].join('\r\n'),
    )

    await expect(parseSesInboundMime(Readable.from([raw]))).resolves.toEqual({
      fromEmail: 'tests+ada@voucha.ai',
      fromName: 'Ada Lovelace',
      subject: 'Help with my account',
      bodyText: 'Please help.',
      emailMessageId: '<tests+incoming@voucha.ai>',
      replyRefs: ['<tests+reply@voucha.ai>', '<tests+first@voucha.ai>'],
    })
  })

  it('rejects MIME without a sender address', async () => {
    const raw = Buffer.from('Subject: Missing sender\r\n\r\nBody')

    await expect(parseSesInboundMime(Readable.from([raw]))).rejects.toBeInstanceOf(
      SesInboundTerminalError,
    )
  })

  it('wraps malformed MIME parser failures as terminal errors', async () => {
    const oversizedHeader = 'x'.repeat(1024 * 1024)
    const raw = Buffer.from(
      `From: tests+sender@voucha.ai\r\nX-Oversized: ${oversizedHeader}\r\n\r\nBody`,
    )

    await expect(parseSesInboundMime(Readable.from([raw]))).rejects.toMatchObject({
      name: 'Error',
      message: 'Raw SES object is not valid MIME',
      cause: expect.any(Error),
    })
  })

  it('preserves source stream failures as retryable errors', async () => {
    const sourceError = new Error('S3 response stream failed')
    async function* failingSource(): AsyncGenerator<Buffer> {
      yield Buffer.from('From: tests+sender@voucha.ai\r\n\r\n')
      throw sourceError
    }

    await expect(parseSesInboundMime(Readable.from(failingSource()))).rejects.toBe(sourceError)
  })

  it('drains a large attachment without retaining it in the parsed result', async () => {
    const result = await parseSesInboundMime(Readable.from(generateLargeAttachmentMime()))

    expect(result).toEqual({
      fromEmail: 'tests+attachment@voucha.ai',
      subject: 'Large attachment',
      bodyText: 'Keep this body only.',
      emailMessageId: null,
      replyRefs: [],
    })
    expect(result).not.toHaveProperty('attachments')
  })

  it('rejects oversized inline text while it is streaming', async () => {
    async function* mime(): AsyncGenerator<Buffer | string> {
      yield 'From: tests+text@voucha.ai\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n'
      const chunk = Buffer.alloc(64 * 1024, 0x61)
      for (let bytes = 0; bytes <= MAX_MIME_TEXT_BYTES; bytes += chunk.byteLength) yield chunk
    }

    await expect(parseSesInboundMime(Readable.from(mime()))).rejects.toMatchObject({
      message: 'Raw SES object is not valid MIME',
      cause: expect.objectContaining({ message: expect.stringContaining('MIME text exceeds') }),
    })
  })
})

async function* generateLargeAttachmentMime(): AsyncGenerator<Buffer | string> {
  yield Buffer.from(
    `${[
      'From: tests+attachment@voucha.ai',
      'Subject: Large attachment',
      'Content-Type: multipart/mixed; boundary="voucha-test-boundary"',
      '',
      '--voucha-test-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Keep this body only.',
      '--voucha-test-boundary',
      'Content-Type: application/octet-stream',
      'Content-Disposition: attachment; filename="large.bin"',
      'Content-Transfer-Encoding: base64',
      '',
    ].join('\r\n')}\r\n`,
  )
  const base64Chunk = `${'QUFB'.repeat(16 * 1024)}\r\n`
  for (let index = 0; index < 192; index += 1) yield base64Chunk
  yield '\r\n--voucha-test-boundary--\r\n'
}
