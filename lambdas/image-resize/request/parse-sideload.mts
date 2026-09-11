import type { APIGatewayProxyEvent } from 'aws-lambda'
import { RequestParseError } from '../errors.mts'
import {
  verifyPathSignature,
  parseSigningKeys,
  SIDELOAD_SIGNING_KEYS_ENV,
} from '@ts-shared/url-signing'
import { getSideloadBase64url } from './event-path.mts'
import { parseImageParams, type ImageParams } from './parse-image-params.mts'

export interface ParsedSideloadRequest extends ImageParams {
  url: string
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function requiresSideloadSigning(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.ENVIRONMENT === 'staging' ||
    process.env.ENVIRONMENT === 'production'
  )
}

export function parseSideloadRequest(
  event: APIGatewayProxyEvent,
  signingKeysValue = process.env[SIDELOAD_SIGNING_KEYS_ENV],
): ParsedSideloadRequest {
  const params = event.queryStringParameters || {}
  const headers = event.headers || {}
  const base64url = getSideloadBase64url(event)
  if (!base64url) {
    throw new RequestParseError('Missing base64url in path', 400)
  }

  // Verify HMAC signature before doing any further work
  const sig = params.sig ?? ''
  const keys = parseSigningKeys(signingKeysValue)
  if (keys.length === 0 && requiresSideloadSigning()) {
    throw new RequestParseError('Sideload signing keys are not configured', 403)
  }
  const path = `/sideload/${base64url}`
  if (!verifyPathSignature(path, sig, keys)) {
    throw new RequestParseError('Invalid or missing signature', 403)
  }

  // Decode base64url to get original URL
  // base64url uses - instead of + and _ instead of /
  let url: string
  try {
    const base64 = base64url.replaceAll('-', '+').replaceAll('_', '/')
    url = Buffer.from(base64, 'base64').toString('utf-8')
  } catch {
    throw new RequestParseError('Invalid base64url encoding in URL', 400)
  }

  // Validate URL format
  if (!isValidUrl(url)) {
    throw new RequestParseError('Invalid URL: must be http:// or https://', 400)
  }

  return { url, ...parseImageParams(params, headers) }
}
