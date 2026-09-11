import { createRandomEmailAddress } from '@voucha/test-helpers'
import { it, expect, describe } from 'vitest'
import { v7 } from 'uuid'
import { upsertUser } from './create.mts'
import { getPrivateUserByAny, getPublicUserByAny } from './get.mts'

describe('get-primary-read', () => {
  it('does not expose private vote weights through public user lookups', async () => {
    const created = await upsertUser({
      emailAddress: createRandomEmailAddress(),
      sessionId: v7(),
      deviceId: v7(),
    })

    const publicUser = await getPublicUserByAny(created.id, { readOnly: false })

    expect(publicUser).not.toHaveProperty('vote_weight')
  })

  it('user lookups support primary reads', async () => {
    const emailAddress = createRandomEmailAddress()
    const created = await upsertUser({ emailAddress, sessionId: v7(), deviceId: v7() })

    const privateUser = await getPrivateUserByAny(emailAddress, { readOnly: false })
    expect(privateUser?.id).toBe(created.id)
    expect(privateUser?.email_address).toBe(emailAddress)

    const publicUser = await getPublicUserByAny(created.id, { readOnly: false })
    expect(publicUser?.id).toBe(created.id)
  })
})
