import { describe, expect, it } from 'vitest'

import {
  GO_NET_HTTP_TRANSPORT_TRANSIENT_ERROR_MARKERS,
  hasAwsTransportTransientError,
} from './aws-transport-fingerprints.mts'

describe('hasAwsTransportTransientError', () => {
  it.each([
    [
      'ECR login TLS handshake timeout',
      'Error response from daemon: Get "https://123456789012.dkr.ecr.us-west-2.amazonaws.com/v2/": net/http: TLS handshake timeout',
    ],
    [
      'response header await timeout',
      'Get "https://123456789012.dkr.ecr.us-west-2.amazonaws.com/v2/": net/http: timeout awaiting response headers',
    ],
    ['connection reset by peer', 'read tcp 10.0.0.1:443: connection reset by peer'],
    [
      'context deadline exceeded',
      'operation error Secrets Manager: GetSecretValue, https response error StatusCode: 0, RequestID: , canceled, context deadline exceeded',
    ],
    [
      'unexpected EOF',
      'rpc error: code = Unavailable desc = error reading from server: unexpected EOF',
    ],
    ['raw I/O timeout', 'dial tcp 10.0.0.1:443: i/o timeout'],
    [
      'Lambda update-function-code closed connection',
      'aws: [ERROR]: Connection was closed before we received a valid response from endpoint URL: "https://lambda.us-west-2.amazonaws.com/2015-03-31/functions/my-fn-staging/code".',
    ],
  ])('matches the %s marker', (_name, text) => {
    expect(hasAwsTransportTransientError(text)).toBe(true)
  })

  it('does not match unrelated error text', () => {
    expect(hasAwsTransportTransientError('AccessDeniedException: User is not authorized')).toBe(
      false,
    )
  })

  it('does not match an empty string', () => {
    expect(hasAwsTransportTransientError('')).toBe(false)
  })

  it('exports the transport subset shared with gh-api', () => {
    expect([...GO_NET_HTTP_TRANSPORT_TRANSIENT_ERROR_MARKERS]).toEqual([
      'net/http: TLS handshake timeout',
      'net/http: timeout awaiting response headers',
      'connection reset by peer',
      'unexpected EOF',
      'i/o timeout',
    ])
  })
})
