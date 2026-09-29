import { read, write } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { banUserFromCommunity } from '../bans/create.mts'
import { archiveCommunity } from '../archive.mts'
import { createApplication } from './create.mts'
import { searchApplications, getApplication } from './get.mts'
import { getPendingApplicationForUser } from './pending.mts'
import { getApplicationQuestions, setApplicationQuestions } from './questions.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'

describe('application answers', () => {
  async function ownedCommunity(owner: PrivateUser): Promise<Community> {
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'private' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    return community
  }

  it('reconstructs optional null, empty, false, and ordered selections', async () => {
    const owner = await createTestUser()
    const applicant = await createTestUser()
    const community = await ownedCommunity(owner)
    const questions = await setApplicationQuestions(owner.id, community.id, [
      { question: 'Short', field_type: 'short_text', required: false },
      { question: 'Long', field_type: 'long_text', required: false },
      { question: 'One', field_type: 'single_select', options: ['Alpha', 'Beta'], required: false },
      { question: 'Many', field_type: 'multi_select', options: ['Alpha', 'Beta'], required: false },
      { question: 'Check', field_type: 'checkbox', required: false },
      { question: 'Skipped', field_type: 'short_text', required: false },
    ])
    const byQuestion = new Map(questions.map(question => [question.question, question]))
    expect(byQuestion.get('One')?.options).toEqual(['Alpha', 'Beta'])
    expect(byQuestion.get('Short')?.options).toBeNull()

    const answers = {
      [byQuestion.get('Short')!.id]: '',
      [byQuestion.get('Long')!.id]: null,
      [byQuestion.get('One')!.id]: 'Alpha',
      [byQuestion.get('Many')!.id]: [],
      [byQuestion.get('Check')!.id]: false,
    }
    const application = await createApplication(applicant.id, community.id, answers)
    expect(application.answers).toEqual(answers)
    expect(application.answers).not.toHaveProperty(byQuestion.get('Skipped')!.id)
    const listed = await searchApplications(community.id)
    expect(listed.results[0]?.answers).toEqual(answers)
  })

  it('stores one row per answered question, keeps explicit null, and cascades with the application', async () => {
    const owner = await createTestUser()
    const applicant = await createTestUser()
    const community = await ownedCommunity(owner)
    const [short, long, skipped] = await setApplicationQuestions(owner.id, community.id, [
      { question: 'Short', field_type: 'short_text', required: false },
      { question: 'Long', field_type: 'long_text', required: false },
      { question: 'Skipped', field_type: 'short_text', required: false },
    ])
    const application = await createApplication(applicant.id, community.id, {
      [short!.id]: 'text',
      [long!.id]: null,
    })

    const stored = async () =>
      (
        await read(
          `/* readStoredAnswers */
          SELECT question_id, value FROM community_application_answers
          WHERE application_id = $1 ORDER BY question_id`,
          [application.id],
        )
      ).rows
    expect(await stored()).toEqual(
      [
        { question_id: short!.id, value: 'text' },
        { question_id: long!.id, value: null },
      ].sort((a, b) => a.question_id.localeCompare(b.question_id)),
    )
    expect(application.answers).not.toHaveProperty(skipped!.id)

    await write(`/* deleteApplication */ DELETE FROM community_applications WHERE id = $1`, [
      application.id,
    ])
    expect(await stored()).toEqual([])
  })

  it('preserves multi-select input order and required checkbox false', async () => {
    const owner = await createTestUser()
    const applicant = await createTestUser()
    const community = await ownedCommunity(owner)
    const questions = await setApplicationQuestions(owner.id, community.id, [
      { question: 'Many', field_type: 'multi_select', options: ['Alpha', 'Beta'], required: false },
      { question: 'Check', field_type: 'checkbox', required: true },
    ])
    const many = questions[0]!
    const check = questions[1]!
    const application = await createApplication(applicant.id, community.id, {
      [many.id]: ['Beta', 'Alpha'],
      [check.id]: false,
    })
    expect(application.answers).toEqual({
      [many.id]: ['Beta', 'Alpha'],
      [check.id]: false,
    })
  })

  it('keeps the original option label after the question is replaced', async () => {
    const owner = await createTestUser()
    const applicant = await createTestUser()
    const community = await ownedCommunity(owner)
    const [original] = await setApplicationQuestions(owner.id, community.id, [
      { question: 'Pick one', field_type: 'single_select', options: ['Legacy'], required: true },
    ])
    const application = await createApplication(applicant.id, community.id, {
      [original!.id]: 'Legacy',
    })
    await setApplicationQuestions(owner.id, community.id, [
      { question: 'New', field_type: 'short_text', required: false },
    ])

    expect(
      (await getApplicationQuestions(community.id)).map(question => question.question),
    ).toEqual(['New'])
    expect((await getApplication(application.id))?.answers).toEqual({ [original!.id]: 'Legacy' })
  })

  it('rejects unknown questions and options before later membership gates', async () => {
    const owner = await createTestUser()
    const applicant = await createTestUser()
    const community = await ownedCommunity(owner)
    await setApplicationQuestions(owner.id, community.id, [
      { question: 'Many', field_type: 'multi_select', options: ['Alpha'], required: false },
    ])
    const [question] = await getApplicationQuestions(community.id)

    await expect(
      createApplication(applicant.id, community.id, { 'not-a-question': 'x' }),
    ).rejects.toMatchObject({ status: 422, message: 'Unknown question' })
    expect(await getPendingApplicationForUser(community.id, applicant.id)).toBeNull()
    await expect(
      createApplication(applicant.id, community.id, { [question!.id]: ['Missing'] }),
    ).rejects.toMatchObject({ status: 422, message: 'Unknown option' })
    await expect(
      createApplication(applicant.id, community.id, { [question!.id]: [1] }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      createApplication(applicant.id, community.id, { [question!.id]: ['Alpha', 'Alpha'] }),
    ).rejects.toMatchObject({ status: 422, message: 'Duplicate option' })

    await insertTestCommunityMember({ communityId: community.id, userId: applicant.id })
    await expect(
      createApplication(applicant.id, community.id, { 'not-a-question': 'x' }),
    ).rejects.toMatchObject({ status: 422, message: 'Unknown question' })

    const banned = await createTestUser()
    await banUserFromCommunity(owner, community.id, banned.id)
    await expect(
      createApplication(banned.id, community.id, { 'not-a-question': 'x' }),
    ).rejects.toMatchObject({ status: 422, message: 'Unknown question' })
  })

  it('rejects duplicate and non-string option labels', async () => {
    const owner = await createTestUser()
    const community = await ownedCommunity(owner)
    await expect(
      setApplicationQuestions(owner.id, community.id, [
        { question: 'Pick', field_type: 'single_select', options: ['Alpha', 'Alpha'] },
      ]),
    ).rejects.toMatchObject({ status: 422, message: 'Option labels must be unique' })
    await expect(
      setApplicationQuestions(owner.id, community.id, [
        {
          question: 'Pick',
          field_type: 'single_select',
          options: ['Alpha', 1] as unknown as string[],
        },
      ]),
    ).rejects.toMatchObject({ status: 422 })
    expect(await getApplicationQuestions(community.id)).toEqual([])
  })

  it('rejects malformed answer documents and clears the active question set', async () => {
    const owner = await createTestUser()
    const applicant = await createTestUser()
    const community = await ownedCommunity(owner)
    const questions = await setApplicationQuestions(owner.id, community.id, [
      { question: 'Short', field_type: 'short_text', required: true },
      { question: 'Check', field_type: 'checkbox', required: false },
      { question: 'One', field_type: 'single_select', options: ['Alpha'], required: false },
      { question: 'Many', field_type: 'multi_select', options: ['Alpha'], required: false },
    ])
    const byQuestion = new Map(questions.map(question => [question.question, question]))
    const shortId = byQuestion.get('Short')!.id
    const checkId = byQuestion.get('Check')!.id
    const oneId = byQuestion.get('One')!.id
    const manyId = byQuestion.get('Many')!.id

    await expect(
      createApplication(applicant.id, community.id, null as unknown as Record<string, unknown>),
    ).rejects.toMatchObject({ status: 422, message: 'answers must be an object' })
    await expect(
      createApplication(applicant.id, community.id, [] as unknown as Record<string, unknown>),
    ).rejects.toMatchObject({ status: 422, message: 'answers must be an object' })
    await expect(createApplication(applicant.id, community.id, {})).rejects.toMatchObject({
      status: 422,
      message: 'Answer required for question: Short',
    })
    await expect(
      createApplication(applicant.id, community.id, { [shortId]: '' }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Answer required for question: Short',
    })
    await expect(
      createApplication(applicant.id, community.id, { [shortId]: 1 }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Expected string for question: Short',
    })
    await expect(
      createApplication(applicant.id, community.id, { [shortId]: 'ok', [checkId]: 'no' }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Expected boolean for checkbox question: Check',
    })
    await expect(
      createApplication(applicant.id, community.id, { [shortId]: 'ok', [oneId]: 1 }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Expected string for question: One',
    })
    await expect(
      createApplication(applicant.id, community.id, { [shortId]: 'ok', [oneId]: 'Missing' }),
    ).rejects.toMatchObject({ status: 422, message: 'Unknown option' })
    await expect(
      createApplication(applicant.id, community.id, { [shortId]: 'ok', [manyId]: 'Alpha' }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Expected array for multi_select question: Many',
    })

    await expect(setApplicationQuestions(owner.id, community.id, [])).resolves.toEqual([])
    expect(await getApplicationQuestions(community.id)).toEqual([])
  })

  it('checks community visibility and archive before answer shape', async () => {
    const owner = await createTestUser()
    const applicant = await createTestUser()
    const publicCommunity = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'public',
    })
    await expect(
      createApplication(applicant.id, publicCommunity.id, { 'not-a-question': 'x' }),
    ).rejects.toMatchObject({
      status: 422,
      message: 'Applications are only for private communities',
    })

    const community = await ownedCommunity(owner)
    await archiveCommunity(community.id, null)
    await expect(
      createApplication(applicant.id, community.id, { 'not-a-question': 'x' }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Archived communities cannot be updated',
    })
  })
})
