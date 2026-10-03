import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { upsertSystemUser } from '@services/users/system-users'
import { getPrivateUserByAny } from '@services/users/get'
import { runSystemTopicSeedImport } from './seed-import-authority.mts'
import {
  currentUserCanCreateTopic,
  currentUserCanUpdateTopic,
  currentUserCanManageTopicAliases,
  currentUserCanMergeTopic,
} from './authorization.mts'

describe('system topic seed authority', () => {
  it('isolates actor and concurrent contexts and expires detached descendants', async () => {
    const system = await upsertSystemUser(`seed-scope-${crypto.randomUUID()}`)
    const actor = (await getPrivateUserByAny(system.id, { readOnly: false }))!
    const otherSystem = await upsertSystemUser(`seed-other-${crypto.randomUUID()}`)
    const other = (await getPrivateUserByAny(otherSystem.id, { readOnly: false }))!
    expect(currentUserCanCreateTopic(actor)).toBe(false)
    let resume!: () => void
    const detachedGate = new Promise<void>(resolve => {
      resume = resolve
    })
    let detached!: Promise<boolean>
    let entered!: () => void
    const scopeEntered = new Promise<void>(resolve => {
      entered = resolve
    })
    let release!: () => void
    const scopeGate = new Promise<void>(resolve => {
      release = resolve
    })
    const scoped = runSystemTopicSeedImport(actor, async () => {
      expect(currentUserCanCreateTopic(actor)).toBe(true)
      expect(currentUserCanUpdateTopic(actor)).toBe(true)
      expect(currentUserCanCreateTopic(other)).toBe(false)
      expect(currentUserCanManageTopicAliases(actor)).toBe(false)
      expect(currentUserCanMergeTopic(actor)).toBe(false)
      detached = detachedGate.then(() => currentUserCanCreateTopic(actor))
      entered()
      await scopeGate
    })
    await scopeEntered
    expect(currentUserCanCreateTopic(actor)).toBe(false)
    release()
    await scoped
    resume()
    await expect(detached).resolves.toBe(false)
    expect(currentUserCanUpdateTopic(actor)).toBe(false)
    const failure = new Error('seed failed')
    await expect(
      runSystemTopicSeedImport(actor, async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    expect(currentUserCanCreateTopic(actor)).toBe(false)
  })

  it('rejects ordinary and administrator seed actors', async () => {
    const ordinary = await createTestUser()
    const admin = await createTestUser({ administrator: true })
    for (const actor of [ordinary, admin]) {
      await expect(runSystemTopicSeedImport(actor, async () => true)).rejects.toMatchObject({
        status: 403,
      })
    }
  })
})
