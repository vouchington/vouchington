import { describe, expect, it } from 'vitest'
import {
  clearRequestCurrentUser,
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

  it('drops the acting user after a later write', async () => {
    await runWithRequestContext(async () => {
      setRequestCurrentUser({ id: 'actor' })
      clearRequestCurrentUser('someone-else')
      expect(getRequestCurrentUser()).toEqual({ id: 'actor' })
      clearRequestCurrentUser('actor')
      expect(getRequestCurrentUser()).toBeUndefined()
    })
  })
})
