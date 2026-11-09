import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { updateReferralLinkValidation } from '@services/referral-program-link-validations'
import { encodeCursor } from '@modules/pagination'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  assignValidationToReferralProgram,
  createReferralProgramLinkValidation,
  createTestUser,
  enableReferralProgramByTopicId,
  insertTestTopic,
} from '@voucha/test-helpers'

describe('GET /api/v1/topics/:referralProgramId/referral-program/validations', () => {
  let admin: PrivateUser
  let nonAdmin: PrivateUser
  let programId: string
  let otherProgramId: string
  let linkedId: string
  let linkedSlug: string
  let unlinkedId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    nonAdmin = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    programId = await insertTestTopic({
      name: `Keyed validation program ${suffix}`,
      slug: `keyed-validation-program-${suffix}`,
      createdById: admin.id,
      topicType: 'referral_program',
    })
    otherProgramId = await insertTestTopic({
      name: `Other validation program ${suffix}`,
      slug: `other-validation-program-${suffix}`,
      createdById: admin.id,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(programId)
    await enableReferralProgramByTopicId(otherProgramId)
    linkedSlug = `linked_${suffix}`
    linkedId = await createReferralProgramLinkValidation(linkedSlug, 'Linked help')
    unlinkedId = await createReferralProgramLinkValidation(`unlinked_${suffix}`)
    await assignValidationToReferralProgram(programId, linkedId)
  })

  it('requires an administrator before reading the binding', async () => {
    const path = `/api/v1/topics/${programId}/referral-program/validations/${linkedId}`
    await createRequest().get(path).expect(401)
    const request = createRequest()
    await request.authenticateAs(nonAdmin)
    await request.get(path).expect(403)
  })

  it('returns the validation only for its linked program', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/topics/${programId}/referral-program/validations/${linkedId}`)
      .expect(200)
    expect(response.body.validation).toMatchObject({ id: linkedId, user_help_text: 'Linked help' })

    const slugResponse = await request
      .get(`/api/v1/topics/${programId}/referral-program/validations/${linkedSlug}`)
      .expect(200)
    expect(slugResponse.body.validation).toMatchObject({ id: linkedId, slug: linkedSlug })

    await request
      .get(`/api/v1/topics/${programId}/referral-program/validations/${unlinkedId}`)
      .expect(404)
    await request
      .get(`/api/v1/topics/${otherProgramId}/referral-program/validations/${linkedId}`)
      .expect(404)
  })

  it('rejects malformed program ids', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .get(`/api/v1/topics/not-a-uuid/referral-program/validations/${linkedId}`)
      .expect(422)
  })

  it('pages linked validations by descending id and rejects a name cursor', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const pagingProgramId = await insertTestTopic({
      name: `Paging validation program ${suffix}`,
      slug: `paging-validation-program-${suffix}`,
      createdById: admin.id,
      topicType: 'referral_program',
    })
    await enableReferralProgramByTopicId(pagingProgramId)

    const ids: string[] = []
    for (const index of [0, 1, 2]) {
      const id = await createReferralProgramLinkValidation(`paging_seed_${suffix}_${index}`)
      ids.push(id)
      await assignValidationToReferralProgram(pagingProgramId, id)
    }
    const descendingIds = ids.toSorted((left, right) => right.localeCompare(left))
    for (const [index, id] of descendingIds.entries()) {
      await updateReferralLinkValidation(admin, id, {
        slug: `paging_order_${suffix}_${2 - index}`,
      })
    }

    const request = createRequest()
    await request.authenticateAs(admin)
    const path = `/api/v1/topics/${pagingProgramId}/referral-program/validations`
    const first = await request.get(path).query({ limit: 2 }).expect(200)
    expect(first.body.results.map((row: { id: string }) => row.id)).toEqual(
      descendingIds.slice(0, 2),
    )
    expect(first.body.page_info.has_next_page).toBe(true)

    const second = await request
      .get(path)
      .query({ limit: 2, after: first.body.page_info.end_cursor })
      .expect(200)
    expect(second.body.results.map((row: { id: string }) => row.id)).toEqual(descendingIds.slice(2))
    expect(second.body.page_info.has_next_page).toBe(false)

    await request
      .get(path)
      .query({ limit: 2, after: encodeCursor({ name: 'old-name', id: descendingIds[0]! }) })
      .expect(400)
  })
})
