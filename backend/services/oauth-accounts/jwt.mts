import createHttpError from 'http-errors'

export function decodeJwtPart(part: string): unknown {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    throw createHttpError(422, 'Invalid JWT format')
  }
}
