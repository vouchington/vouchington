import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildResponse,
  buildErrorResponse,
  buildFileResponse,
  MAX_API_GATEWAY_IMAGE_BYTES,
  MAX_LAMBDA_SYNC_RESPONSE_BYTES,
} from './builder.mts'

describe('buildResponse', () => {
  it('rejects an image that cannot fit through the non-streaming API Gateway boundary', () => {
    const largestResponse = buildResponse(200, Buffer.alloc(MAX_API_GATEWAY_IMAGE_BYTES), 'jpeg')
    const response = buildResponse(200, Buffer.alloc(MAX_API_GATEWAY_IMAGE_BYTES + 1), 'jpeg')

    expect(Buffer.byteLength(JSON.stringify(largestResponse))).toBeLessThanOrEqual(
      MAX_LAMBDA_SYNC_RESPONSE_BYTES,
    )
    expect(response.statusCode).toBe(413)
    expect(response.isBase64Encoded).toBe(false)
  })

  it('should build response with Buffer body and JPEG format', () => {
    const buffer = Buffer.from('fake-image-data')
    const response = buildResponse(200, buffer, 'jpeg')

    expect(response.statusCode).toBe(200)
    expect(response.isBase64Encoded).toBe(true)
    expect(response.body).toBe(buffer.toString('base64'))
    expect(response.headers?.['Content-Type']).toBe('image/jpeg')
    expect(response.headers?.['Cache-Control']).toBe('public, max-age=31536000, immutable')
  })

  it('should build response with Buffer body and PNG format', () => {
    const buffer = Buffer.from('fake-png-data')
    const response = buildResponse(200, buffer, 'png')

    expect(response.statusCode).toBe(200)
    expect(response.isBase64Encoded).toBe(true)
    expect(response.headers?.['Content-Type']).toBe('image/png')
  })

  it('should build response with Buffer body and WebP format', () => {
    const buffer = Buffer.from('fake-webp-data')
    const response = buildResponse(200, buffer, 'webp')

    expect(response.statusCode).toBe(200)
    expect(response.isBase64Encoded).toBe(true)
    expect(response.headers?.['Content-Type']).toBe('image/webp')
  })

  it('should build response with Buffer body and AVIF format', () => {
    const buffer = Buffer.from('fake-avif-data')
    const response = buildResponse(200, buffer, 'avif')

    expect(response.statusCode).toBe(200)
    expect(response.isBase64Encoded).toBe(true)
    expect(response.headers?.['Content-Type']).toBe('image/avif')
  })

  it('should build response with Buffer body but no format specified', () => {
    const buffer = Buffer.from('fake-data')
    const response = buildResponse(200, buffer)

    expect(response.statusCode).toBe(200)
    expect(response.isBase64Encoded).toBe(true)
    expect(response.body).toBe(buffer.toString('base64'))
    // Content-Type should not be set when format is not specified
    expect(response.headers?.['Content-Type']).toBeUndefined()
  })

  it('should build response with string body (error case)', () => {
    const response = buildResponse(404, 'Image not found')

    expect(response.statusCode).toBe(404)
    expect(response.isBase64Encoded).toBe(false)
    expect(response.body).toBe(JSON.stringify({ error: 'Image not found' }))
    expect(response.headers?.['Content-Type']).toBe('application/json')
    expect(response.headers?.['Cache-Control']).toBe('no-store')
  })

  it('should set Cache-Control header for successful responses', () => {
    const buffer = Buffer.from('data')
    const response = buildResponse(200, buffer, 'jpeg')

    expect(response.headers?.['Cache-Control']).toBe('public, max-age=31536000, immutable')
  })

  it('should not cache error responses', () => {
    const response = buildResponse(404, 'Not found')

    expect(response.headers?.['Cache-Control']).toBe('no-store')
  })

  it('should encode Buffer to base64', () => {
    const buffer = Buffer.from('test-data')
    const response = buildResponse(200, buffer, 'jpeg')

    expect(response.body).toBe(buffer.toString('base64'))
    expect(response.isBase64Encoded).toBe(true)
  })

  it('should handle empty Buffer', () => {
    const buffer = Buffer.from('')
    const response = buildResponse(200, buffer, 'jpeg')

    expect(response.statusCode).toBe(200)
    expect(response.isBase64Encoded).toBe(true)
    expect(response.body).toBe('')
  })

  it('should set Vary: Accept header for image responses', () => {
    const buffer = Buffer.from('image-data')
    const response = buildResponse(200, buffer, 'jpeg')

    expect(response.headers?.['Vary']).toBe('Accept')
  })

  it('should set Vary: Accept for all image formats', () => {
    const buffer = Buffer.from('image-data')

    const jpegResponse = buildResponse(200, buffer, 'jpeg')
    expect(jpegResponse.headers?.['Vary']).toBe('Accept')

    const pngResponse = buildResponse(200, buffer, 'png')
    expect(pngResponse.headers?.['Vary']).toBe('Accept')

    const webpResponse = buildResponse(200, buffer, 'webp')
    expect(webpResponse.headers?.['Vary']).toBe('Accept')

    const avifResponse = buildResponse(200, buffer, 'avif')
    expect(avifResponse.headers?.['Vary']).toBe('Accept')
  })

  it('should not set Vary header when format is not specified', () => {
    const buffer = Buffer.from('data')
    const response = buildResponse(200, buffer)

    expect(response.headers?.['Vary']).toBeUndefined()
  })

  it('should not set Vary header for non-Buffer responses', () => {
    const response = buildResponse(404, 'Not found')

    expect(response.headers?.['Vary']).toBeUndefined()
  })

  it('should set Cross-Origin-Resource-Policy: cross-origin on image responses', () => {
    const buffer = Buffer.from('image-data')
    const response = buildResponse(200, buffer, 'jpeg')

    expect(response.headers?.['Cross-Origin-Resource-Policy']).toBe('cross-origin')
  })

  it('should set Cross-Origin-Resource-Policy: cross-origin on error responses', () => {
    const response = buildResponse(404, 'Not found')

    expect(response.headers?.['Cross-Origin-Resource-Policy']).toBe('cross-origin')
  })
})

describe('buildErrorResponse', () => {
  it('should build 400 error response', () => {
    const response = buildErrorResponse(400, 'Invalid request')

    expect(response.statusCode).toBe(400)
    expect(response.isBase64Encoded).toBe(false)
    expect(response.body).toBe(JSON.stringify({ error: 'Invalid request' }))
    expect(response.headers?.['Content-Type']).toBe('application/json')
  })

  it('should build 404 error response', () => {
    const response = buildErrorResponse(404, 'Image not found')

    expect(response.statusCode).toBe(404)
    expect(response.body).toBe(JSON.stringify({ error: 'Image not found' }))
  })

  it('should build 500 error response', () => {
    const response = buildErrorResponse(500, 'Internal server error')

    expect(response.statusCode).toBe(500)
    expect(response.body).toBe(JSON.stringify({ error: 'Internal server error' }))
  })

  it('should always set Content-Type to application/json', () => {
    const response = buildErrorResponse(400, 'Error message')

    expect(response.headers?.['Content-Type']).toBe('application/json')
  })

  it('should not set Cache-Control header for error responses', () => {
    const response = buildErrorResponse(400, 'Error message')

    expect(response.headers?.['Cache-Control']).toBeUndefined()
  })

  it('should set Cross-Origin-Resource-Policy: cross-origin', () => {
    const response = buildErrorResponse(400, 'Error message')

    expect(response.headers?.['Cross-Origin-Resource-Policy']).toBe('cross-origin')
  })

  it('should handle error messages with special characters', () => {
    const message = 'Error: "Invalid" <parameter>'
    const response = buildErrorResponse(400, message)

    const body = JSON.parse(response.body)
    expect(body.error).toBe(message)
  })

  it('should handle empty error message', () => {
    const response = buildErrorResponse(500, '')

    expect(response.body).toBe(JSON.stringify({ error: '' }))
  })
})

describe('buildFileResponse', () => {
  it('reads bounded files into API Gateway responses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'image-response-test-'))
    const boundedPath = join(directory, 'bounded')
    await writeFile(boundedPath, 'image')

    try {
      await expect(
        buildFileResponse(200, { path: boundedPath, cleanup: async () => undefined }, 'jpeg'),
      ).resolves.toMatchObject({ statusCode: 200, body: Buffer.from('image').toString('base64') })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
