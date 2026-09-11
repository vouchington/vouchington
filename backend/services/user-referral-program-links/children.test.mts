import { beforeAll, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import type { PrivateUser } from '@services/users/types'
import { createReferralProgramFixture, createTestUser } from '@voucha/test-helpers'
import { createUserReferralLink } from './create.mts'
import { createChildReferralLink } from './create-child.mts'
import {
  getActiveChildUrlIdsForParent,
  reconcileChildrenForParent,
  softDeleteChildrenForUser,
  softDeleteChildrenOfParent,
} from './children.mts'
import { getUserReferralLink } from './get.mts'

describe('children', () => {
  let user: PrivateUser
  let referralProgramId: string | null = null
  let testHostname: string | null = null

  beforeAll(async () => {
    user = await createTestUser()
    const randomSuffix = Math.random().toString(36).slice(7)
    testHostname = `children-test-${randomSuffix}.com`

    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/refer',
    })
    referralProgramId = fixture.referralProgramId
  })

  async function createParentWithChildren(count: number) {
    const parent = await createUserReferralLink(user, {
      user_id: user.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=parent-${Math.random().toString(36).slice(7)}`,
      label: 'Parent link',
    })

    const children = []
    for (let i = 0; i < count; i++) {
      const child = await createChildReferralLink(user.id, {
        userId: user.id,
        referralProgramId: referralProgramId!,
        url: `https://${testHostname}/refer?test=child-${parent.id}-${i}`,
        parentLinkId: parent.id,
      })
      children.push(child)
    }

    return { parent, children }
  }

  it('getActiveChildUrlIdsForParent returns url_ids of active children only', async () => {
    const { parent, children } = await createParentWithChildren(2)

    const urlIds = await getActiveChildUrlIdsForParent(parent.id)

    assert.equal(urlIds.length, 2)
    assert.ok(urlIds.includes(children[0]!.url_id))
    assert.ok(urlIds.includes(children[1]!.url_id))
  })

  it('softDeleteChildrenOfParent soft-deletes all children but leaves the parent', async () => {
    const { parent, children } = await createParentWithChildren(2)

    await softDeleteChildrenOfParent(parent.id)

    const stillParent = await getUserReferralLink(parent.id)
    assert.ok(stillParent)

    for (const child of children) {
      const deleted = await getUserReferralLink(child.id)
      assert.equal(deleted, null)
    }
  })

  it("softDeleteChildrenForUser soft-deletes all of a user's children across parents", async () => {
    const otherUser = await createTestUser()
    const { children: userChildren } = await createParentWithChildren(1)

    const otherParent = await createUserReferralLink(otherUser, {
      user_id: otherUser.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer?test=other-parent-${Math.random().toString(36).slice(7)}`,
    })
    const otherChild = await createChildReferralLink(otherUser.id, {
      userId: otherUser.id,
      referralProgramId: referralProgramId!,
      url: `https://${testHostname}/refer?test=other-child-${otherParent.id}`,
      parentLinkId: otherParent.id,
    })

    await softDeleteChildrenForUser(user.id)

    const deletedOwn = await getUserReferralLink(userChildren[0]!.id)
    assert.equal(deletedOwn, null)

    const untouchedOther = await getUserReferralLink(otherChild.id)
    assert.ok(untouchedOther)
  })

  it('reconcileChildrenForParent soft-deletes children not in keepUrlIds and keeps the rest', async () => {
    const { parent, children } = await createParentWithChildren(3)
    const keepUrlIds = [children[0]!.url_id, children[1]!.url_id]

    await reconcileChildrenForParent(parent.id, keepUrlIds)

    const kept0 = await getUserReferralLink(children[0]!.id)
    const kept1 = await getUserReferralLink(children[1]!.id)
    const dropped = await getUserReferralLink(children[2]!.id)

    assert.ok(kept0)
    assert.ok(kept1)
    assert.equal(dropped, null)
  })

  it('reconcileChildrenForParent with an empty keep list soft-deletes all children', async () => {
    const { parent, children } = await createParentWithChildren(2)

    await reconcileChildrenForParent(parent.id, [])

    for (const child of children) {
      const deleted = await getUserReferralLink(child.id)
      assert.equal(deleted, null)
    }

    const stillParent = await getUserReferralLink(parent.id)
    assert.ok(stillParent)
  })
})
