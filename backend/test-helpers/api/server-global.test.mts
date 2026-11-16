import { afterEach, describe, expect, it } from 'vitest'
import { API_TEST_SERVER_STATE_KEY, isApiTestServerStarted } from './server-global.mts'

type StateGlobal = Record<string, unknown>

describe('isApiTestServerStarted', () => {
  afterEach(() => {
    delete (globalThis as StateGlobal)[API_TEST_SERVER_STATE_KEY]
  })

  it('is false until the shared API test server state is registered', () => {
    expect(isApiTestServerStarted()).toBe(false)
  })

  it('is true once the shared API test server state is registered', () => {
    ;(globalThis as StateGlobal)[API_TEST_SERVER_STATE_KEY] = {}
    expect(isApiTestServerStarted()).toBe(true)
  })
})
