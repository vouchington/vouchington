import assert from 'http-assert'
import type { CopyrightEmailAttachmentInput } from './email-intakes.mts'
import { copyrightEmailReplyHeaders } from './email-thread-references.mts'

export type CopyrightEmailParseInput =
  | {
      status: 'succeeded'
      fromEmail: string
      fromName?: string
      subject: string
      bodyText: string
      messageId: string | null
      inReplyTo?: string[]
      replyReferences: string[]
      attachments: CopyrightEmailAttachmentInput[]
    }
  | { status: 'failed'; error: string }

export function validateCopyrightEmailParseInput(input: CopyrightEmailParseInput): void {
  if (input.status === 'failed') {
    assert(input.error.length > 0 && input.error.length <= 10_000, 422, 'Invalid parser failure')
    return
  }
  assert(input.fromEmail.trim().length > 0 && input.fromEmail.length <= 320, 422, 'Invalid sender')
  assert(!input.fromName || input.fromName.length <= 500, 422, 'Invalid sender name')
  assert(input.subject.length > 0 && input.subject.length <= 10_000, 422, 'Invalid subject')
  assert(input.bodyText.length > 0 && input.bodyText.length <= 2_000_000, 422, 'Invalid body')
  assert(!input.messageId || input.messageId.length <= 10_000, 422, 'Invalid Message-ID')
  const replyHeaders = [
    ...copyrightEmailReplyHeaders(input).inReplyTo,
    ...copyrightEmailReplyHeaders(input).references,
  ]
  assert(
    replyHeaders.length <= 100 &&
      replyHeaders.every(reference => reference.length > 0 && reference.length <= 10_000),
    422,
    'Invalid reply references',
  )
  assert(input.attachments.length <= 100, 422, 'Too many attachments')
  assert(
    input.attachments.every(
      attachment =>
        attachment.sha256.length === 32 &&
        Number.isSafeInteger(attachment.byteSize) &&
        attachment.byteSize >= 0 &&
        attachment.mimeType.length > 0 &&
        attachment.mimeType.length <= 255 &&
        (!attachment.filename || attachment.filename.length <= 1024) &&
        (!attachment.contentId || attachment.contentId.length <= 1024),
    ),
    422,
    'Invalid attachment metadata',
  )
}
