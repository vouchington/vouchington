import { describe, expect, it } from 'vitest'
import {
  getRequestCurrentUser,
  runWithRequestContext,
  setRequestCurrentUser,
} from './request-context.mts'

describe('request context store', () => {
  it('stays empty outside a request', () => {
    expect(getRequestCurrentUser()).toBeUndefined()
    setRequestCurrentUser({ id: 'ignored' })
    expect(getRequestCurrentUser()).toBeUndefined()
  })

  it('holds only the value set inside the request', async () => {
    await runWithRequestContext(async () => {
      expect(getRequestCurrentUser()).toBeUndefined()
      setRequestCurrentUser(null)
      expect(getRequestCurrentUser()).toBeNull()
    })
    expect(getRequestCurrentUser()).toBeUndefined()
  })
})
