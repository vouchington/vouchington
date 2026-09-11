import type { APIGatewayProxyResult } from 'aws-lambda'
import { imageFormatContentType } from '@vouchington/image-resize'
import type { OutputFormat } from '../config.mts'
import { readFile, stat } from 'node:fs/promises'
import type { TempImageFile } from '../temp-file.mts'

export const FORMAT_TO_CONTENT_TYPE: Record<OutputFormat, string> = {
  jpeg: imageFormatContentType('jpeg'),
  png: imageFormatContentType('png'),
  webp: imageFormatContentType('webp'),
  avif: imageFormatContentType('avif'),
}

// API Gateway's non-streaming Lambda payload limit is 6 MiB. RESPONSE_STREAM in
// vouchington-infra is required before this boundary can become fully streaming.
export const MAX_LAMBDA_SYNC_RESPONSE_BYTES = 6 * 1024 * 1024
const MAX_IMAGE_RESPONSE_ENVELOPE_BYTES = Math.max(
  ...Object.keys(FORMAT_TO_CONTENT_TYPE).map(format =>
    Buffer.byteLength(
      JSON.stringify({
        statusCode: 200,
        headers: responseHeaders(true, true, format as OutputFormat),
        body: '',
        isBase64Encoded: true,
      }),
    ),
  ),
)
export const MAX_API_GATEWAY_IMAGE_BYTES =
  Math.floor((MAX_LAMBDA_SYNC_RESPONSE_BYTES - MAX_IMAGE_RESPONSE_ENVELOPE_BYTES) / 4) * 3

export function buildResponse(
  statusCode: number,
  body: Buffer | string,
  format?: OutputFormat,
): APIGatewayProxyResult {
  if (Buffer.isBuffer(body) && body.byteLength > MAX_API_GATEWAY_IMAGE_BYTES) {
    return buildErrorResponse(413, 'Rendered image exceeds maximum response size')
  }
  const isBuffer = Buffer.isBuffer(body)
  const isSuccess = statusCode >= 200 && statusCode < 300

  const headers = responseHeaders(isSuccess, isBuffer, format)

  return {
    statusCode,
    headers,
    body: isBuffer ? body.toString('base64') : JSON.stringify({ error: body }),
    isBase64Encoded: isBuffer,
  }
}

function responseHeaders(
  isSuccess: boolean,
  isBuffer: boolean,
  format?: OutputFormat,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': isSuccess ? 'public, max-age=31536000, immutable' : 'no-store',
  }
  if (isBuffer && format) {
    headers['Content-Type'] = FORMAT_TO_CONTENT_TYPE[format]
    headers['Vary'] = 'Accept'
  } else if (!isBuffer) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

export async function buildFileResponse(
  statusCode: number,
  file: TempImageFile,
  format: OutputFormat,
): Promise<APIGatewayProxyResult> {
  const size = (await stat(file.path)).size
  if (size > MAX_API_GATEWAY_IMAGE_BYTES) {
    return buildErrorResponse(413, 'Rendered image exceeds maximum response size')
  }
  return buildResponse(statusCode, await readFile(file.path), format)
}

export function buildErrorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
    body: JSON.stringify({ error: message }),
    isBase64Encoded: false,
  }
}
