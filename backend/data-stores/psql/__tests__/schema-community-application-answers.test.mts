import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  insertAnswer,
  insertApplication,
  insertQuestion,
  seedCommunity,
} from '../../../test-helpers/data-stores/psql/community-application-answer-schema.mts'
import { insertTestCommunity } from '../../../test-helpers/entities/communities.mts'
import { onGracefulShutdown, read, write } from '../index.mts'

async function countAnswers(applicationId: string): Promise<number> {
  const { rows } = await read(
    `/* countCommunityApplicationAnswers */
      SELECT count(*)::int AS count FROM community_application_answers WHERE application_id = $1`,
    [applicationId],
  )
  return (rows[0] as { count: number }).count
}

describe('community application answer rows', () => {
  afterAll(onGracefulShutdown)

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
    expect(await countAnswers(applicationId)).toBe(1)
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
    const { rows } = await read(
      `/* readCommunityApplicationAnswerValue */
        SELECT value FROM community_application_answers WHERE application_id = $1`,
      [applicationId],
    )
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
    expect(await countAnswers(applicationId)).toBe(2)
    await write(`/* deleteApplication */ DELETE FROM community_applications WHERE id = $1`, [
      applicationId,
    ])
    expect(await countAnswers(applicationId)).toBe(0)
    const { rows } = await read(
      `/* countSurvivingQuestions */
        SELECT count(*)::int AS count FROM community_application_questions WHERE community_id = $1`,
      [community.id],
    )
    expect(rows[0]).toEqual({ count: 2 })
  })

  it('hard-deletes application answers with the community', async () => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id)
    const applicationId = await insertApplication(community.id, user.id)
    await insertAnswer(applicationId, community.id, questionId, 'x')
    await write(`/* deleteCommunity */ DELETE FROM communities WHERE id = $1`, [community.id])
    const { rows } = await read(
      `/* countDeletedCommunityApplicationRows */
        SELECT
          (SELECT count(*)::int FROM community_applications WHERE community_id = $1) AS applications,
          (SELECT count(*)::int FROM community_application_questions WHERE community_id = $1) AS questions,
          (SELECT count(*)::int FROM community_application_answers WHERE community_id = $1) AS answers`,
      [community.id],
    )
    expect(rows[0]).toEqual({ applications: 0, questions: 0, answers: 0 })
  })

  it('keeps answers when their question is soft-deleted', async () => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id)
    const applicationId = await insertApplication(community.id, user.id)
    await insertAnswer(applicationId, community.id, questionId, 'kept')
    await write(
      `/* softDeleteQuestion */
        UPDATE community_application_questions SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [questionId],
    )
    expect(await countAnswers(applicationId)).toBe(1)
  })
})
