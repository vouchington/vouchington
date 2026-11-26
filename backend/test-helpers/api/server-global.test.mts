import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_TEST_SERVER_STATE_KEY, isApiTestServerStarted } from './server-global.mts'

describe('isApiTestServerStarted', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false until the shared API test server state is registered', () => {
    expect(isApiTestServerStarted()).toBe(false)
  })

  it('is true once the shared API test server state is registered', () => {
    vi.stubGlobal(API_TEST_SERVER_STATE_KEY, {})
    expect(isApiTestServerStarted()).toBe(true)
  })
})
