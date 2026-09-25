/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- This test only fakes a local Context
   object (vi.fn), it does not mock a module; the .no-data.mock suffix is load-bearing because it
   routes the test to the DB/Valkey-free project (validateRequestContract needs neither). */
import { describe, expect, it, vi } from 'vitest'
import { validateRequestContract } from './response-helpers.mts'

function createContext() {
  const ctx = {
    throw: vi.fn<(status: number, message?: string) => never>((status, message) => {
      const error = new Error(message) as Error & { status: number }
      error.status = status
      throw error
    }),
  }
  return ctx
}

describe('validateRequestContract', () => {
  it('does not throw when every declared carrier is valid', () => {
    const ctx = createContext()
    expect(() =>
      validateRequestContract(ctx as never, 'POST:/api/v1/my/api-keys', {
        body: { label: 'My Key', permissions: ['rss:read'] },
      }),
    ).not.toThrow()
    expect(ctx.throw).not.toHaveBeenCalled()
  })

  it('throws a 422 through ctx.throw when the body carrier fails its schema', () => {
    const ctx = createContext()
    expect(() =>
      validateRequestContract(ctx as never, 'POST:/api/v1/my/api-keys', { body: null }),
    ).toThrow(/Invalid request body/)
    expect(ctx.throw).toHaveBeenCalledWith(422, expect.stringContaining('Invalid request body'))
  })

  it('throws a 422 through ctx.throw when the body is an array instead of an object', () => {
    const ctx = createContext()
    expect(() =>
      validateRequestContract(ctx as never, 'POST:/api/v1/conversations', {
        body: ['not', 'an', 'object'],
      }),
    ).toThrow(/Invalid request body/)
    expect(ctx.throw).toHaveBeenCalledWith(422, expect.stringContaining('Invalid request body'))
  })

  it('validates the path carrier independently of the body carrier', () => {
    const ctx = createContext()
    expect(() =>
      validateRequestContract(ctx as never, 'DELETE:/api/v1/my/api-keys/:id', {
        path: { id: 'any-non-empty-string' },
      }),
    ).not.toThrow()
    expect(ctx.throw).not.toHaveBeenCalled()
  })

  it('fails closed with a thrown Error (not ctx.throw) for an unknown operation', () => {
    const ctx = createContext()
    expect(() =>
      validateRequestContract(ctx as never, 'GET:/api/v1/does-not-exist', { query: {} }),
    ).toThrow(/No generated runtime request contract/)
    expect(ctx.throw).not.toHaveBeenCalled()
  })
})
