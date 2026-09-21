import { MailParser, type AddressObject, type HeaderValue } from 'mailparser'
import { Readable, Transform } from 'node:stream'
import { streamMailParts, type ParsedMimeAttachment } from './streamed-mail-parts.mts'

const MAX_MIME_HEADER_BYTES = 1024 * 1024

export type ParsedSesInboundEmail = {
  fromEmail: string
  fromName?: string
  subject: string
  bodyText: string
  emailMessageId: string | null
  replyRefs: string[]
  attachments?: ParsedMimeAttachment[]
  recipientEmails?: string[]
}

export class SesInboundTerminalError extends Error {}

export async function parseSesInboundMime(rawMime: Readable): Promise<ParsedSesInboundEmail> {
  const parser = new MailParser({
    skipHtmlToText: true,
    skipTextToHtml: true,
    skipImageLinks: true,
    maxHeadSize: MAX_MIME_HEADER_BYTES,
  } as ConstructorParameters<typeof MailParser>[0] & {
    maxHeadSize: number
  })
  let sender: AddressObject | undefined
  let subject = ''
  let messageId: string | null = null
  let references = ''
  let inReplyTo = ''
  let recipientEmails: string[] = []
  const parts = streamMailParts(parser)
  const headerLimiter = createMimeHeaderLimitStream()
  let sourceStreamError: unknown
  await new Promise<void>((resolve, reject) => {
    parser.once('headers', headers => {
      sender = asAddress(headers.get('from'))
      subject = String(headers.get('subject') ?? '')
      messageId = String(headers.get('message-id') ?? '').trim() || null
      references = String(headers.get('references') ?? '')
      inReplyTo = String(headers.get('in-reply-to') ?? '')
      recipientEmails = [
        ...new Set(
          ['to', 'delivered-to', 'x-original-to'].flatMap(header =>
            getHeaderAddresses(headers.get(header)).map(address => address.toLowerCase()),
          ),
        ),
      ]
    })
    parser.once('error', error => {
      rawMime.destroy()
      headerLimiter.destroy()
      reject(error)
    })
    parser.once('end', resolve)
    rawMime.once('error', error => {
      sourceStreamError = error
      headerLimiter.destroy(error)
    })
    headerLimiter.once('error', error => parser.destroy(error))
    rawMime.pipe(headerLimiter).pipe(parser)
  }).catch(error => {
    if (error === sourceStreamError) throw error
    throw new SesInboundTerminalError('Raw SES object is not valid MIME', { cause: error })
  })

  const from = sender?.value[0]
  if (!from?.address?.trim()) {
    throw new SesInboundTerminalError('Inbound support email has no sender address')
  }
  const normalizedSubject = subject.trim() || '(No subject)'
  const fromName = from.name?.trim()
  return {
    fromEmail: from.address.trim(),
    ...(fromName ? { fromName } : {}),
    subject: normalizedSubject,
    bodyText: parts.getBodyText() || normalizedSubject,
    emailMessageId: messageId,
    replyRefs: normalizeReplyReferences(inReplyTo, references),
    attachments: parts.getAttachments(),
    recipientEmails,
  }
}

function createMimeHeaderLimitStream(): Transform {
  let headerBytes = 0
  let rollingBytes = 0
  let complete = false
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!complete) {
        for (const byte of chunk) {
          headerBytes += 1
          if (headerBytes > MAX_MIME_HEADER_BYTES) {
            const error = new Error('Max header size for a MIME node exceeded')
            Object.assign(error, { code: 'EMAXLEN' })
            callback(error)
            return
          }
          rollingBytes = ((rollingBytes << 8) | byte) >>> 0
          if (rollingBytes === 0x0d0a0d0a || (rollingBytes & 0xffff) === 0x0a0a) {
            complete = true
            break
          }
        }
      }
      callback(null, chunk)
    },
  })
}

function asAddress(value: HeaderValue | undefined): AddressObject | undefined {
  return value && typeof value === 'object' && 'value' in value && Array.isArray(value.value)
    ? (value as AddressObject)
    : undefined
}

function getHeaderAddresses(value: HeaderValue | undefined): string[] {
  const address = asAddress(value)
  return address?.value.flatMap(item => (item.address?.trim() ? [item.address.trim()] : [])) ?? []
}

function normalizeReplyReferences(inReplyTo: string, references: string): string[] {
  return [
    ...new Set(
      [inReplyTo, ...references.split(/[\s,]+/)].flatMap(value => {
        const normalized = value.trim()
        return normalized ? [normalized] : []
      }),
    ),
  ]
}
