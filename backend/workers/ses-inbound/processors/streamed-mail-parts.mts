import { MailParser, type AttachmentStream, type HeaderValue } from 'mailparser'
import type { Readable } from 'node:stream'

export const MAX_MIME_TEXT_BYTES = 2 * 1024 * 1024
const MAX_MIME_NODES = 1000

type MailParserChunk = {
  type: string
  contentType?: string
  disposition?: string | false
  root?: boolean
  messageNode?: boolean
}

type MailParserInternals = MailParser & {
  textTypes: string[]
  processChunk: (data: MailParserChunk, done: (error?: Error) => void) => void
}

type StreamedTextKind = 'plain' | 'html' | null

export function streamMailParts(parser: MailParser): () => string {
  const internals = parser as MailParserInternals
  const pendingParts: StreamedTextKind[] = []
  const plainParts: string[] = []
  const htmlParts: string[] = []
  let retainedTextBytes = 0
  let nodeCount = 0

  internals.textTypes = []
  const processChunk = internals.processChunk
  internals.processChunk = (data, done) => {
    if (data.type === 'node') {
      nodeCount += 1
      if (nodeCount > MAX_MIME_NODES) {
        done(new Error(`MIME message exceeds ${MAX_MIME_NODES} nodes`))
        return
      }
      const contentType = data.contentType ?? (data.root ? 'text/plain' : '')
      if (
        !contentType.startsWith('multipart/') &&
        !(contentType === 'message/rfc822' && data.messageNode)
      ) {
        const inline = !data.disposition || data.disposition === 'inline'
        pendingParts.push(
          inline && contentType === 'text/plain'
            ? 'plain'
            : inline && contentType === 'text/html'
              ? 'html'
              : null,
        )
      }
    }
    processChunk.call(parser, data, done)
  }

  parser.on('data', part => {
    if (part.type !== 'attachment') return
    const kind = pendingParts.shift() ?? null
    consumePart(part, kind)
  })

  function consumePart(part: AttachmentStream, kind: StreamedTextKind): void {
    const content = part.content as Readable
    let released = false
    const release = () => {
      if (released) return
      released = true
      part.release()
    }
    if (!kind) {
      content.once('error', (error: Error) => {
        release()
        parser.destroy(error)
      })
      content.once('end', release)
      content.resume()
      return
    }

    const decoder = createTextDecoder(part.headers.get('content-type'))
    let value = ''
    content.on('data', (rawChunk: Buffer | string) => {
      const chunk = typeof rawChunk === 'string' ? Buffer.from(rawChunk) : rawChunk
      retainedTextBytes += chunk.byteLength
      if (retainedTextBytes > MAX_MIME_TEXT_BYTES) {
        content.destroy(new Error(`MIME text exceeds ${MAX_MIME_TEXT_BYTES} bytes`))
        return
      }
      value += decoder.decode(chunk, { stream: true })
    })
    content.once('error', (error: Error) => {
      release()
      parser.destroy(error)
    })
    content.once('end', () => {
      value += decoder.decode()
      const trimmed = value.trim()
      if (trimmed) (kind === 'plain' ? plainParts : htmlParts).push(trimmed)
      release()
    })
  }

  return () => (plainParts.length > 0 ? plainParts : htmlParts).join('\n').trim()
}

function createTextDecoder(contentType: HeaderValue | undefined): TextDecoder {
  const charset =
    contentType &&
    typeof contentType === 'object' &&
    !Array.isArray(contentType) &&
    'params' in contentType &&
    typeof contentType.params.charset === 'string'
      ? contentType.params.charset
      : 'utf-8'
  try {
    return new TextDecoder(charset)
  } catch {
    return new TextDecoder()
  }
}
