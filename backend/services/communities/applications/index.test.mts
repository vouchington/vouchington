import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createApplication } from './create.mts'
import { searchApplications } from './get.mts'
import { getApplicationQuestions, setApplicationQuestions } from './questions.mts'
import { archiveCommunity } from '../archive.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'

describe('index', () => {
  let owner: PrivateUser
  let privateCommunity: Community
  let publicCommunity: Community

  beforeAll(async () => {
    owner = await createTestUser()
    ;[privateCommunity, publicCommunity] = await Promise.all([
      insertTestCommunity({ createdById: owner.id, visibility: 'private' }),
      insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
    ])
    await Promise.all([
      insertTestCommunityMember({
        communityId: privateCommunity.id,
        userId: owner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: owner.id,
        role: 'owner',
      }),
    ])
  })

  describe('setApplicationQuestions / getApplicationQuestions', () => {
    it('sets and retrieves questions', async () => {
      await setApplicationQuestions(owner.id, privateCommunity.id, [
        { question: 'Why do you want to join?', field_type: 'long_text', required: true },
        { question: 'Agree to rules?', field_type: 'checkbox', required: true },
      ])

      const questions = await getApplicationQuestions(privateCommunity.id)
      expect(questions).toHaveLength(2)
      expect(questions[0]!.question).toBe('Why do you want to join?')
      expect(questions[1]!.field_type).toBe('checkbox')
    })

    it('replaces existing questions on re-set', async () => {
      await setApplicationQuestions(owner.id, privateCommunity.id, [
        { question: 'New question only', field_type: 'short_text', required: false },
      ])
      const questions = await getApplicationQuestions(privateCommunity.id)
      expect(questions).toHaveLength(1)
      expect(questions[0]!.question).toBe('New question only')
    })

    it('rejects archived communities', async () => {
      const archivedCommunity = await insertTestCommunity({
        createdById: owner.id,
        visibility: 'private',
      })
      await insertTestCommunityMember({
        communityId: archivedCommunity.id,
        userId: owner.id,
        role: 'owner',
      })
      await archiveCommunity(archivedCommunity.id, null)

      await expect(
        setApplicationQuestions(owner.id, archivedCommunity.id, [
          { question: 'Why do you want to join?', field_type: 'long_text', required: true },
        ]),
      ).rejects.toMatchObject({ status: 403 })
    }, 60_000)
  })

  describe('createApplication', () => {
    it('applicant can submit for a private community', async () => {
      const applicant = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        visibility: 'private',
      })

      const app = await createApplication(applicant.id, community.id, {})
      expect(app.user_id).toBe(applicant.id)
      expect(app.community_id).toBe(community.id)
      expect(app.approved_at).toBeNull()
      expect(app.rejected_at).toBeNull()
    })

    it('rejects application for a public community', async () => {
      const user = await createTestUser()
      await expect(createApplication(user.id, publicCommunity.id, {})).rejects.toMatchObject({
        status: 422,
      })
    })

    it('rejects duplicate pending application', async () => {
      const applicant = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        visibility: 'private',
      })
      await createApplication(applicant.id, community.id, {})
      await expect(createApplication(applicant.id, community.id, {})).rejects.toMatchObject({
        status: 409,
      })
    })

    it('rejects application for existing member', async () => {
      const user = await createTestUser()
      await insertTestCommunityMember({ communityId: privateCommunity.id, userId: user.id })
      await expect(createApplication(user.id, privateCommunity.id, {})).rejects.toMatchObject({
        status: 409,
      })
    })
  })

  describe('searchApplications', () => {
    it('returns applications for a community', async () => {
      const community = await insertTestCommunity({
        createdById: owner.id,
        visibility: 'private',
      })
      const applicant = await createTestUser()
      await createApplication(applicant.id, community.id, {})

      const result = await searchApplications(community.id)
      expect(result.results.length).toBeGreaterThan(0)
    })
  })
})
