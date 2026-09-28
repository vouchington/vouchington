import http from 'node:http'
import { describe, expect, it } from 'vitest'
import { httpRequestToLambdaEvent } from './http-request-to-lambda-event.mts'

function makeReq(url: string, method = 'GET', headers: Record<string, string> = {}) {
  return { url, method, headers } as unknown as http.IncomingMessage
}

describe('httpRequestToLambdaEvent', () => {
  it('maps basic request fields', () => {
    const event = httpRequestToLambdaEvent(makeReq('/api/foo?bar=1', 'GET'))
    expect(event.path).toBe('/api/foo')
    expect(event.httpMethod).toBe('GET')
    expect(event.queryStringParameters!).toEqual({ bar: '1' })
    expect(event.pathParameters!).toEqual({})
  })

  it('does not turn a removed generic path into a query key', () => {
    const event = httpRequestToLambdaEvent(makeReq('/images/photos/cat.jpg'))
    expect(event.queryStringParameters!.key).toBeUndefined()
    expect(event.queryStringParameters!.env).toBeUndefined()
  })

  it('preserves an exact placement path without manufacturing a query key', () => {
    const event = httpRequestToLambdaEvent(
      makeReq(
        '/images/placements/00000000-0000-7000-8000-000000000001/2/00000000-0000-7000-8000-000000000002?w=400',
      ),
    )

    expect(event.queryStringParameters!.key).toBeUndefined()
    expect(event.path).toBe(
      '/images/placements/00000000-0000-7000-8000-000000000001/2/00000000-0000-7000-8000-000000000002',
    )
  })

  it('does not manufacture nested raw S3 key authority', () => {
    const event = httpRequestToLambdaEvent(makeReq('/images/a/b/c/image.webp'))
    expect(event.queryStringParameters!.key).toBeUndefined()
    expect(event.queryStringParameters!.env).toBeUndefined()
  })

  it('preserves resize query parameters without injecting path identity', () => {
    const event = httpRequestToLambdaEvent(makeReq('/images/img.jpg?w=400&q=80'))
    expect(event.queryStringParameters!.key).toBeUndefined()
    expect(event.queryStringParameters!.w).toBe('400')
    expect(event.queryStringParameters!.q).toBe('80')
    expect(event.queryStringParameters!.env).toBeUndefined()
  })

  it('extracts base64url from /sideload/v2/{base64url}', () => {
    const b64 = 'aHR0cHM6Ly9leGFtcGxlLmNvbS9pbWcuanBn'
    const event = httpRequestToLambdaEvent(makeReq(`/sideload/v2/${b64}`))
    expect(event.pathParameters!.base64url).toBe(b64)
  })

  it('extracts ogBase64url from /og/{base64url} without colliding with sideload', () => {
    const b64 = 'eyJ0eXBlIjoiZ2VuZXJpYyJ9'
    const event = httpRequestToLambdaEvent(makeReq(`/og/${b64}`))
    expect(event.pathParameters!.ogBase64url).toBe(b64)
    expect(event.pathParameters!.base64url).toBeUndefined()
  })

  it('does not set S3 params for non-matching paths', () => {
    const event = httpRequestToLambdaEvent(makeReq('/health'))
    expect(event.queryStringParameters!.env).toBeUndefined()
    expect(event.queryStringParameters!.key).toBeUndefined()
    expect(event.pathParameters!.base64url).toBeUndefined()
  })

  it('populates multiValueQueryStringParameters for duplicate keys', () => {
    const event = httpRequestToLambdaEvent(makeReq('/api/foo?tag=a&tag=b&w=400'))
    expect(event.multiValueQueryStringParameters!['tag']).toEqual(['a', 'b'])
    expect(event.multiValueQueryStringParameters!['w']).toEqual(['400'])
  })

  it('forwards string headers', () => {
    const event = httpRequestToLambdaEvent(
      makeReq('/images/img.jpg', 'GET', {
        accept: 'image/webp,image/*',
        'accept-encoding': 'gzip',
      }),
    )
    expect(event.headers.accept).toBe('image/webp,image/*')
    expect(event.headers['accept-encoding']).toBe('gzip')
  })
})
