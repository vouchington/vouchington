import { randomUUID } from 'node:crypto'
import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import {
  countCommunityApplicationAnswers,
  countDeletedCommunityApplicationRows,
  countSurvivingCommunityApplicationQuestions,
  deleteCommunityApplication,
  deleteCommunityForApplicationTest,
  insertAnswer,
  insertApplication,
  insertQuestion,
  readCommunityApplicationAnswerValues,
  seedCommunity,
  softDeleteCommunityApplicationQuestion,
} from '../../../test-helpers/data-stores/psql/community-application-answer-schema.mts'
import { insertTestCommunity } from '../../../test-helpers/entities/communities.mts'

describe('community application answer rows', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it('rejects a question from another community through the composite FK', async () => {
    const { user, community } = await seedCommunity()
    const other = await insertTestCommunity({ createdById: user.id, visibility: 'private' })
    const questionId = await insertQuestion(other.id)
    const applicationId = await insertApplication(community.id, user.id)
    await expect(
      insertAnswer(applicationId, community.id, questionId, 'yes'),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'community_application_answers_question_fkey',
    })
  })

  it('rejects an application from another community through the composite FK', async () => {
    const { user, community } = await seedCommunity()
    const other = await insertTestCommunity({ createdById: user.id, visibility: 'private' })
    const questionId = await insertQuestion(community.id)
    const applicationId = await insertApplication(other.id, user.id)
    await expect(
      insertAnswer(applicationId, community.id, questionId, 'yes'),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'community_application_answers_application_fkey',
    })
  })

  it('rejects an unknown question id at the FK when the service check is bypassed', async () => {
    const { user, community } = await seedCommunity()
    const applicationId = await insertApplication(community.id, user.id)
    await expect(
      insertAnswer(applicationId, community.id, randomUUID(), 'yes'),
    ).rejects.toMatchObject({
      code: '23503',
      constraint: 'community_application_answers_question_fkey',
    })
  })

  it('stores one row per question and rejects a second answer for the same question', async () => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id)
    const applicationId = await insertApplication(community.id, user.id)
    await insertAnswer(applicationId, community.id, questionId, 'first')
    await expect(
      insertAnswer(applicationId, community.id, questionId, 'second'),
    ).rejects.toMatchObject({ code: '23505' })
    expect(await countCommunityApplicationAnswers(applicationId)).toBe(1)
  })

  it.each([
    ['a string', 'text'],
    ['an empty string', ''],
    ['a boolean', false],
    ['an explicit null', null],
    ['an array of strings', ['Beta', 'Alpha']],
    ['an empty array', []],
  ])('accepts %s as a value', async (_label, value) => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id)
    const applicationId = await insertApplication(community.id, user.id)
    await insertAnswer(applicationId, community.id, questionId, value)
    const rows = await readCommunityApplicationAnswerValues(applicationId)
    expect(rows).toEqual([{ value }])
  })

  it.each([
    ['a number', 1],
    ['an object', { label: 'Alpha' }],
    ['an array with a non-string element', ['Alpha', 1]],
    ['an array with a null element', ['Alpha', null]],
  ])('rejects %s as a value', async (_label, value) => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id)
    const applicationId = await insertApplication(community.id, user.id)
    await expect(
      insertAnswer(applicationId, community.id, questionId, value),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'community_application_answers_value_check',
    })
  })

  it('cascades answer rows when the application is deleted', async () => {
    const { user, community } = await seedCommunity()
    const first = await insertQuestion(community.id, 0)
    const second = await insertQuestion(community.id, 1)
    const applicationId = await insertApplication(community.id, user.id)
    await insertAnswer(applicationId, community.id, first, 'a')
    await insertAnswer(applicationId, community.id, second, ['b'])
    expect(await countCommunityApplicationAnswers(applicationId)).toBe(2)
    await deleteCommunityApplication(applicationId)
    expect(await countCommunityApplicationAnswers(applicationId)).toBe(0)
    expect(await countSurvivingCommunityApplicationQuestions(community.id)).toEqual({ count: 2 })
  })

  it('hard-deletes application answers with the community', async () => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id)
    const applicationId = await insertApplication(community.id, user.id)
    await insertAnswer(applicationId, community.id, questionId, 'x')
    await deleteCommunityForApplicationTest(community.id)
    expect(await countDeletedCommunityApplicationRows(community.id)).toEqual({
      applications: 0,
      questions: 0,
      answers: 0,
    })
  })

  it('keeps answers when their question is soft-deleted', async () => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id)
    const applicationId = await insertApplication(community.id, user.id)
    await insertAnswer(applicationId, community.id, questionId, 'kept')
    await softDeleteCommunityApplicationQuestion(questionId)
    expect(await countCommunityApplicationAnswers(applicationId)).toBe(1)
  })

  it('rejects an order_index outside 0 to 999 and accepts both ends', async () => {
    const { community } = await seedCommunity()
    await insertQuestion(community.id, 0)
    await insertQuestion(community.id, 999)
    await expect(insertQuestion(community.id, 1000)).rejects.toMatchObject({
      code: '23514',
      constraint: 'community_application_questions_order_index_range',
    })
    await expect(insertQuestion(community.id, -1)).rejects.toMatchObject({
      constraint: 'community_application_questions_order_index_range',
    })
  })
})
