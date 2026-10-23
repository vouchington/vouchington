import createHttpError from 'http-errors'
import { decodeJwtPart } from '@services/oauth-accounts/jwt'

export type MicrosoftClaims = {
  aud?: string
  iss?: string
  tid?: string
  oid?: string
  exp?: number
  nbf?: number
  email?: string
  nonce?: unknown
  xms_edov?: boolean
}

type MicrosoftIdentityTokenParts = {
  headerPart: string
  payloadPart: string
  signaturePart: string
  header: { alg: 'RS256'; kid: string }
}

export function parseMicrosoftIdentityTokenParts(idToken: string): MicrosoftIdentityTokenParts {
  const parts = idToken.split('.')
  const [headerPart, payloadPart, signaturePart] = parts
  if (parts.length !== 3 || !headerPart || !payloadPart || !signaturePart) {
    throw createHttpError(401, 'Invalid Microsoft identity token')
  }
  const decodedHeader = decodeJwtPart(headerPart)
  if (typeof decodedHeader !== 'object' || decodedHeader === null || Array.isArray(decodedHeader)) {
    throw createHttpError(401, 'Invalid Microsoft identity token algorithm')
  }
  const header = decodedHeader as { alg?: unknown; kid?: unknown }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw createHttpError(401, 'Invalid Microsoft identity token algorithm')
  }
  return { headerPart, payloadPart, signaturePart, header: { alg: header.alg, kid: header.kid } }
}

export function parseMicrosoftIdentityTokenClaims(payloadPart: string): MicrosoftClaims {
  const decodedClaims = decodeJwtPart(payloadPart)
  if (typeof decodedClaims !== 'object' || decodedClaims === null || Array.isArray(decodedClaims)) {
    throw createHttpError(401, 'Microsoft identity token claims are invalid')
  }
  return decodedClaims as MicrosoftClaims
}
