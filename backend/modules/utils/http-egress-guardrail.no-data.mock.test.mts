/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentryCaptureMessageMock. @modules/utils does not depend on @sentry/node directly (only transitively via @modules/on-error), so this file relies on the global setup mock rather than declaring its own in-file vi.mock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import {
  classifyEgressOrigin,
  createEgressGuardrailInterceptor,
  resetEgressGuardrailDedupeForTest,
} from './http-egress-guardrail.mts'

describe('classifyEgressOrigin', () => {
  it('classifies a non-allowlisted host as off-allowlist', () => {
    expect(classifyEgressOrigin('https://api.stripe.com')).toBe('off-allowlist')
  })

  it('classifies an allowlisted host as allowlisted', () => {
    expect(classifyEgressOrigin('https://o4507688154824704.ingest.us.sentry.io')).toBe(
      'allowlisted',
    )
  })

  it('classifies a loopback origin as exempt', () => {
    expect(classifyEgressOrigin('http://127.0.0.1:3000')).toBe('exempt')
  })

  it('classifies an undefined origin as exempt', () => {
    expect(classifyEgressOrigin(undefined)).toBe('exempt')
  })

  it('classifies an unparseable origin string as exempt', () => {
    expect(classifyEgressOrigin('not a valid url')).toBe('exempt')
  })
})

describe('createEgressGuardrailInterceptor', () => {
  beforeEach(() => {
    sentryCaptureMessageMock.mockClear()
    resetEgressGuardrailDedupeForTest()
  })

  it('delegates to dispatch and reports an off-allowlist host to Sentry', () => {
    const stubDispatch = vi.fn<() => boolean>(() => true)
    const interceptor = createEgressGuardrailInterceptor()
    const dispatch = interceptor(stubDispatch)

    const result = dispatch(
      { origin: 'https://api.stripe.com', path: '/v1/charges', method: 'POST' },
      {},
    )

    expect(result).toBe(true)
    expect(stubDispatch).toHaveBeenCalledOnce()
    expect(sentryCaptureMessageMock).toHaveBeenCalledOnce()
    const [message, options] = sentryCaptureMessageMock.mock.calls[0]
    expect(message).toContain('api.stripe.com')
    expect(options).toMatchObject({
      level: 'warning',
      tags: { egress_guardrail: 'off_allowlist', egress_host: 'api.stripe.com' },
    })
  })

  it('strips the query string from the reported path', () => {
    const stubDispatch = vi.fn<() => boolean>(() => true)
    const dispatch = createEgressGuardrailInterceptor()(stubDispatch)

    dispatch(
      { origin: 'https://api.stripe.com', path: '/v1/search?q=secret+term', method: 'GET' },
      {},
    )

    expect(sentryCaptureMessageMock).toHaveBeenCalledOnce()
    const [, options] = sentryCaptureMessageMock.mock.calls[0]
    expect(options).toMatchObject({ extra: { path: '/v1/search', method: 'GET' } })
  })

  it('does not report the same off-allowlist host to Sentry twice', () => {
    const stubDispatch = vi.fn<() => boolean>(() => true)
    const dispatch = createEgressGuardrailInterceptor()(stubDispatch)

    dispatch({ origin: 'https://api.stripe.com', path: '/v1/charges', method: 'POST' }, {})
    dispatch({ origin: 'https://api.stripe.com', path: '/v1/customers', method: 'GET' }, {})

    expect(stubDispatch).toHaveBeenCalledTimes(2)
    expect(sentryCaptureMessageMock).toHaveBeenCalledOnce()
  })

  it('does not report an allowlisted origin to Sentry, but still delegates', () => {
    const stubDispatch = vi.fn<() => boolean>(() => true)
    const dispatch = createEgressGuardrailInterceptor()(stubDispatch)

    const result = dispatch(
      {
        origin: 'https://o4507688154824704.ingest.us.sentry.io',
        path: '/api/4507721302736896/envelope',
        method: 'POST',
      },
      {},
    )

    expect(result).toBe(true)
    expect(stubDispatch).toHaveBeenCalledOnce()
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })

  it('does not report an exempt origin to Sentry, but still delegates', () => {
    const stubDispatch = vi.fn<() => boolean>(() => true)
    const dispatch = createEgressGuardrailInterceptor()(stubDispatch)

    const result = dispatch({ origin: 'http://127.0.0.1:3000', path: '/', method: 'GET' }, {})

    expect(result).toBe(true)
    expect(stubDispatch).toHaveBeenCalledOnce()
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })
})
