import { createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import {
  getRequestCurrentUser,
  runWithRequestContext,
  setRequestCurrentUser,
} from '@modules/utils/request-context'
import { loadRequestPrivateUser } from './request-user.mts'

describe('request acting user', () => {
  it('is empty outside a request and a worker still loads the user', async () => {
    const user = await createTestUser()
    expect(getRequestCurrentUser()).toBeUndefined()
    await expect(loadRequestPrivateUser(user.id)).resolves.toMatchObject({ id: user.id })
  })

  it('reuses the acting user already stored for this request', async () => {
    const user = await createTestUser()
    await runWithRequestContext(async () => {
      setRequestCurrentUser(user)
      await expect(loadRequestPrivateUser(user.id)).resolves.toBe(user)
    })
  })
})
