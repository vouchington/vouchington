import type { APIGatewayProxyEvent } from 'aws-lambda'
import { RequestParseError } from '../errors.mts'
import {
  verifyPathSignature,
  parseSigningKeys,
  SIDELOAD_SIGNING_KEYS_ENV,
} from '@ts-shared/url-signing'
import { getOgBase64url } from './event-path.mts'
import { validateOgParams, type OgParams } from '../og/params.mts'

export interface ParsedOgRequest {
  params: OgParams
}

// Mirrors parse-sideload.mts's requiresSideloadSigning() exactly: OG cards
// reuse the same signing keys/gating as sideload, not a second secret.
function requiresOgSigning(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ENVIRONMENT === 'staging' ||
    process.env.ENVIRONMENT === 'production'
  )
}

export function parseOgRequest(
  event: APIGatewayProxyEvent,
  signingKeysValue = process.env[SIDELOAD_SIGNING_KEYS_ENV],
): ParsedOgRequest {
  const params = event.queryStringParameters || {}
  const base64url = getOgBase64url(event)
  if (!base64url) {
    throw new RequestParseError('Missing base64url in path', 400)
  }

  // Verify HMAC signature before doing any further work. The signature
  // covers only the path (`/og/<base64url>`), never the query string.
  const sig = params.sig ?? ''
  const keys = parseSigningKeys(signingKeysValue)
  if (keys.length === 0 && requiresOgSigning()) {
    throw new RequestParseError('OG signing keys are not configured', 403)
  }
  const path = `/og/${base64url}`
  if (!verifyPathSignature(path, sig, keys)) {
    throw new RequestParseError('Invalid or missing signature', 403)
  }

  // Decode base64url to the OG params JSON payload.
  let json: unknown
  try {
    const decoded = Buffer.from(base64url, 'base64url').toString('utf-8')
    json = JSON.parse(decoded)
  } catch {
    throw new RequestParseError('Invalid base64url or JSON encoding in OG params', 400)
  }

  return { params: validateOgParams(json) }
}
