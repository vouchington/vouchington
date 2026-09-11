import createError from 'http-errors'

export const SUPPORT_MESSAGE_BODY_ERROR_MESSAGE = 'Message body must include text or HTML content'

export const createSupportMessageBodyError = () =>
  createError(422, SUPPORT_MESSAGE_BODY_ERROR_MESSAGE)

export function assertSupportMessageBody(bodyText?: string | null, bodyHtml?: string | null): void {
  if ((bodyText ?? '').trim() === '' && (bodyHtml ?? '').trim() === '') {
    throw createSupportMessageBodyError()
  }
}
