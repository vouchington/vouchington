import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

describe('community application answer routes', () => {
  it('keeps unauthenticated malformed answers at 401 and rejects unknown questions with 422', async () => {
    const [owner, applicant] = await Promise.all([createTestUser(), createTestUser()])
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `apps-answers-${random}`,
      visibility: 'private',
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner!.id,
      role: 'owner',
    })

    const anonymous = createRequest()
    await anonymous
      .post(`/api/v1/communities/${community.slug}/applications`)
      .set('Content-Type', 'application/json')
      .send({ answers: { 'not-a-question': ['nope'] } })
      .expect(401)

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner!)
    const questions = await ownerRequest
      .put(`/api/v1/communities/${community.slug}/application-questions`)
      .set('Content-Type', 'application/json')
      .send({
        questions: [
          {
            question: 'Choose any',
            field_type: 'multi_select',
            options: ['Alpha', 'Beta'],
            is_required: false,
          },
        ],
      })
      .expect(200)
    expect(questions.body.questions[0].options).toEqual(['Alpha', 'Beta'])
    const questionId = questions.body.questions[0].id as string

    const applicantRequest = createRequest()
    await applicantRequest.authenticateAs(applicant!)
    await applicantRequest
      .post(`/api/v1/communities/${community.slug}/applications`)
      .set('Content-Type', 'application/json')
      .send({ answers: { 'not-a-question': 'x' } })
      .expect(422)
    await applicantRequest
      .post(`/api/v1/communities/${community.slug}/applications`)
      .set('Content-Type', 'application/json')
      .send({ answers: { [questionId]: [1] } })
      .expect(422)

    const created = await applicantRequest
      .post(`/api/v1/communities/${community.slug}/applications`)
      .set('Content-Type', 'application/json')
      .send({ answers: { [questionId]: ['Beta', 'Alpha'] } })
      .expect(201)
    expect(created.body.community_application.answers).toEqual({
      [questionId]: ['Beta', 'Alpha'],
    })

    const listed = await ownerRequest
      .get(`/api/v1/communities/${community.slug}/applications`)
      .expect(200)
    expect(listed.body.results).toEqual([
      { __entity_type: 'community_application', id: created.body.community_application.id },
    ])
    expect(listed.body.page_info.has_next_page).toBe(false)
    expect(
      listed.body.community_applications[created.body.community_application.id].answers,
    ).toEqual({ [questionId]: ['Beta', 'Alpha'] })

    await ownerRequest
      .patch(
        `/api/v1/communities/${community.slug}/applications/${created.body.community_application.id}`,
      )
      .set('Content-Type', 'application/json')
      .send({ status: 'approved' })
      .expect(204)
  })
})
