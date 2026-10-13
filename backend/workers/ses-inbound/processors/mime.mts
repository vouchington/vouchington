import { MailParser, type AddressObject, type HeaderValue } from 'mailparser'
import { Readable, Transform } from 'node:stream'
import { streamMailParts, type ParsedMimeAttachment } from './streamed-mail-parts.mts'

export const MAX_MIME_HEADER_BYTES = 1024 * 1024

export type ParsedSesInboundEmail = {
  fromEmail: string
  fromName?: string
  subject: string
  bodyText: string
  emailMessageId: string | null
  inReplyTo: string[]
  references: string[]
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
  let references: string[] = []
  let inReplyTo: string[] = []
  let recipientEmails: string[] = []
  const parts = streamMailParts(parser)
  const headerLimiter = createMimeHeaderLimitStream()
  let sourceStreamError: unknown
  await new Promise<void>((resolve, reject) => {
    parser.once('headers', headers => {
      sender = asAddress(headers.get('from'))
      subject = String(headers.get('subject') ?? '')
      messageId = String(headers.get('message-id') ?? '').trim() || null
      recipientEmails = [
        ...new Set(
          ['to', 'delivered-to', 'x-original-to'].flatMap(header =>
            getHeaderAddresses(headers.get(header)).map(address => address.toLowerCase()),
          ),
        ),
      ]
    })
    parser.once('headerLines', lines => {
      for (const header of lines as Array<{ key: string; line: string }>) {
        if (header.key === 'references') {
          references.push(...parseMessageIds(header.line.slice(header.line.indexOf(':') + 1)))
        } else if (header.key === 'in-reply-to') {
          inReplyTo.push(...parseMessageIds(header.line.slice(header.line.indexOf(':') + 1)))
        }
      }
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
  }).catch(err => {
    if (err === sourceStreamError) throw err
    throw new SesInboundTerminalError('Raw SES object is not valid MIME', { cause: err })
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
    inReplyTo: [...new Set(inReplyTo)],
    references: [...new Set(references)],
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

function parseMessageIds(value: string): string[] {
  const ids: string[] = []
  let index = 0
  while (index < value.length) {
    while (index < value.length && /[\s,]/.test(value[index]!)) index += 1
    if (index === value.length) break
    const start = index
    if (value[index] === '<') {
      let quoted = false
      let escaped = false
      index += 1
      while (index < value.length) {
        const char = value[index++]!
        if (escaped) escaped = false
        else if (char === '\\' && quoted) escaped = true
        else if (char === '"') quoted = !quoted
        else if (char === '>' && !quoted) break
      }
      if (value[index - 1] === '>' && !quoted) ids.push(value.slice(start, index))
    } else {
      while (index < value.length && !/[\s,]/.test(value[index]!)) index += 1
      ids.push(`<${value.slice(start, index)}>`)
    }
  }
  return ids
}
