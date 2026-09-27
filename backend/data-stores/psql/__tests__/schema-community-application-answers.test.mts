import { afterAll, describe, expect, it } from 'vitest'
import {
  insertAnswer,
  insertApplication,
  insertOption,
  insertQuestion,
  seedCommunity,
} from '../../../test-helpers/data-stores/psql/community-application-answer-schema.mts'
import { insertTestCommunity } from '../../../test-helpers/entities/communities.mts'
import { beginTransaction, onGracefulShutdown, read, write } from '../index.mts'

describe('community application answer relations', () => {
  afterAll(onGracefulShutdown)

  it('rejects a question from another community', async () => {
    const { user, community } = await seedCommunity()
    const other = await insertTestCommunity({ createdById: user.id, visibility: 'private' })
    const questionId = await insertQuestion(other.id, 'short_text')
    const applicationId = await insertApplication(community.id, user.id)
    await expect(
      insertAnswer(applicationId, community.id, questionId, 'short_text', false, 'yes', null),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('rejects an option that belongs to another question', async () => {
    const { user, community } = await seedCommunity()
    const firstQuestionId = await insertQuestion(community.id, 'single_select', 0)
    const secondQuestionId = await insertQuestion(community.id, 'single_select', 1)
    const otherOptionId = await insertOption(
      community.id,
      secondQuestionId,
      'single_select',
      'Other',
    )
    const applicationId = await insertApplication(community.id, user.id)
    {
      await using query = await beginTransaction()
      const { rows } = await query(
        `/* insertSingleSelectAnswer */
          INSERT INTO community_application_answers (
            application_id, community_id, question_id, question_field_type,
            is_null, text_value, boolean_value
          )
          VALUES ($1, $2, $3, 'single_select', false, NULL, NULL)
          RETURNING id`,
        [applicationId, community.id, firstQuestionId],
      )
      const answerId = (rows[0] as { id: string }).id
      await expect(
        query(
          `/* insertWrongQuestionOption */
            INSERT INTO community_application_answer_selections (
              application_answer_id, application_id, community_id, question_id,
              question_field_type, option_id, order_index
            )
            VALUES ($1, $2, $3, $4, 'single_select', $5, 0)`,
          [answerId, applicationId, community.id, firstQuestionId, otherOptionId],
        ),
      ).rejects.toMatchObject({ code: '23503' })
    }
  })

  it('rejects duplicate active labels and order violations', async () => {
    const { community } = await seedCommunity()
    const questionId = await insertQuestion(community.id, 'multi_select')
    await insertOption(community.id, questionId, 'multi_select', 'Alpha', 0)
    await expect(
      insertOption(community.id, questionId, 'multi_select', 'Alpha', 1),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      insertOption(community.id, questionId, 'multi_select', 'Beta', 0),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      insertOption(community.id, questionId, 'multi_select', 'Gamma', -1),
    ).rejects.toMatchObject({ code: '23514' })
  })
  it.each([
    ['short_text', true, 'x', null],
    ['short_text', false, 'ok', true],
    ['checkbox', false, 'no', null],
    ['single_select', false, 'x', null],
  ] as const)(
    'rejects invalid %s answer state',
    async (fieldType, isNull, textValue, booleanValue) => {
      const { user, community } = await seedCommunity()
      const questionId = await insertQuestion(community.id, fieldType)
      const applicationId = await insertApplication(community.id, user.id)
      await expect(
        insertAnswer(
          applicationId,
          community.id,
          questionId,
          fieldType,
          isNull,
          textValue,
          booleanValue,
        ),
      ).rejects.toMatchObject({ code: '23514' })
    },
  )

  it('rejects a second single-select option and a duplicate selection order', async () => {
    const { user, community } = await seedCommunity()
    const singleId = await insertQuestion(community.id, 'single_select', 0)
    const multiId = await insertQuestion(community.id, 'multi_select', 1)
    const firstOptionId = await insertOption(community.id, singleId, 'single_select', 'One', 0)
    const secondOptionId = await insertOption(community.id, singleId, 'single_select', 'Two', 1)
    const alphaId = await insertOption(community.id, multiId, 'multi_select', 'Alpha', 0)
    const betaId = await insertOption(community.id, multiId, 'multi_select', 'Beta', 1)
    const applicationId = await insertApplication(community.id, user.id)
    {
      await using query = await beginTransaction()
      const { rows } = await query(
        `/* insertSingleSelectAnswer */
          INSERT INTO community_application_answers (
            application_id, community_id, question_id, question_field_type,
            is_null, text_value, boolean_value
          )
          VALUES ($1, $2, $3, 'single_select', false, NULL, NULL)
          RETURNING id`,
        [applicationId, community.id, singleId],
      )
      const singleAnswerId = (rows[0] as { id: string }).id
      await query(
        `/* insertFirstSingleSelection */
          INSERT INTO community_application_answer_selections (
            application_answer_id, application_id, community_id, question_id,
            question_field_type, option_id, order_index
          )
          VALUES ($1, $2, $3, $4, 'single_select', $5, 0)`,
        [singleAnswerId, applicationId, community.id, singleId, firstOptionId],
      )
      await expect(
        query(
          `/* insertSecondSingleSelection */
            INSERT INTO community_application_answer_selections (
              application_answer_id, application_id, community_id, question_id,
              question_field_type, option_id, order_index
            )
            VALUES ($1, $2, $3, $4, 'single_select', $5, 1)`,
          [singleAnswerId, applicationId, community.id, singleId, secondOptionId],
        ),
      ).rejects.toMatchObject({ code: '23505' })
    }

    const multiAnswerId = await insertAnswer(
      applicationId,
      community.id,
      multiId,
      'multi_select',
      false,
      null,
      null,
    )
    await write(
      `/* insertFirstMultiSelection */
        INSERT INTO community_application_answer_selections (
          application_answer_id, application_id, community_id, question_id,
          question_field_type, option_id, order_index
        )
        VALUES ($1, $2, $3, $4, 'multi_select', $5, 0)`,
      [multiAnswerId, applicationId, community.id, multiId, alphaId],
    )
    await expect(
      write(
        `/* insertDuplicateSelectionOrder */
          INSERT INTO community_application_answer_selections (
            application_answer_id, application_id, community_id, question_id,
            question_field_type, option_id, order_index
          )
          VALUES ($1, $2, $3, $4, 'multi_select', $5, 0)`,
        [multiAnswerId, applicationId, community.id, multiId, betaId],
      ),
    ).rejects.toMatchObject({ code: '23505' })
  })

  it('rejects an empty single-select and a null answer that still has a selection at commit', async () => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id, 'single_select')
    const optionId = await insertOption(community.id, questionId, 'single_select', 'Alpha')
    const applicationId = await insertApplication(community.id, user.id)

    {
      await using emptySelect = await beginTransaction()
      await emptySelect(
        `/* insertEmptySingleSelect */
          INSERT INTO community_application_answers (
            application_id, community_id, question_id, question_field_type,
            is_null, text_value, boolean_value
          )
          VALUES ($1, $2, $3, 'single_select', false, NULL, NULL)`,
        [applicationId, community.id, questionId],
      )
      await expect(emptySelect.commit()).rejects.toMatchObject({ code: '23514' })
    }

    {
      await using nullSelection = await beginTransaction()
      const { rows } = await nullSelection(
        `/* insertNullSelectAnswer */
          INSERT INTO community_application_answers (
            application_id, community_id, question_id, question_field_type,
            is_null, text_value, boolean_value
          )
          VALUES ($1, $2, $3, 'single_select', true, NULL, NULL)
          RETURNING id`,
        [applicationId, community.id, questionId],
      )
      const answerId = (rows[0] as { id: string }).id
      await nullSelection(
        `/* insertSelectionOnNullAnswer */
          INSERT INTO community_application_answer_selections (
            application_answer_id, application_id, community_id, question_id,
            question_field_type, option_id, order_index
          )
          VALUES ($1, $2, $3, $4, 'single_select', $5, 0)`,
        [answerId, applicationId, community.id, questionId, optionId],
      )
      await expect(nullSelection.commit()).rejects.toMatchObject({ code: '23514' })
    }
  })

  it('rolls back the application when a typed answer is invalid', async () => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id, 'checkbox')
    let applicationId = ''
    {
      await using query = await beginTransaction()
      const { rows } = await query(
        `/* insertRollbackApplication */
          INSERT INTO community_applications (community_id, user_id)
          VALUES ($1, $2)
          RETURNING id`,
        [community.id, user.id],
      )
      applicationId = (rows[0] as { id: string }).id
      await expect(
        query(
          `/* insertInvalidCheckbox */
            INSERT INTO community_application_answers (
              application_id, community_id, question_id, question_field_type,
              is_null, text_value, boolean_value
            )
            VALUES ($1, $2, $3, 'checkbox', false, 'no', NULL)`,
          [applicationId, community.id, questionId],
        ),
      ).rejects.toMatchObject({ code: '23514' })
    }

    const { rows: remaining } = await read(
      `/* findRolledBackApplication */
        SELECT id FROM community_applications WHERE id = $1`,
      [applicationId],
    )
    expect(remaining).toEqual([])
  })

  it('hard-deletes application answers with the community', async () => {
    const { user, community } = await seedCommunity()
    const questionId = await insertQuestion(community.id, 'multi_select')
    const optionId = await insertOption(community.id, questionId, 'multi_select', 'Alpha')
    const applicationId = await insertApplication(community.id, user.id)
    const answerId = await insertAnswer(
      applicationId,
      community.id,
      questionId,
      'multi_select',
      false,
      null,
      null,
    )
    await write(
      `/* insertCascadeSelection */
        INSERT INTO community_application_answer_selections (
          application_answer_id, application_id, community_id, question_id,
          question_field_type, option_id, order_index
        )
        VALUES ($1, $2, $3, $4, 'multi_select', $5, 0)`,
      [answerId, applicationId, community.id, questionId, optionId],
    )
    await write(`/* deleteCommunity */ DELETE FROM communities WHERE id = $1`, [community.id])
    const { rows } = await read(
      `/* countDeletedCommunityApplicationRows */
        SELECT
          (SELECT count(*)::int FROM community_applications WHERE community_id = $1) AS applications,
          (SELECT count(*)::int FROM community_application_questions WHERE community_id = $1) AS questions,
          (SELECT count(*)::int FROM community_application_question_options WHERE community_id = $1) AS options,
          (SELECT count(*)::int FROM community_application_answers WHERE community_id = $1) AS answers,
          (SELECT count(*)::int FROM community_application_answer_selections WHERE community_id = $1) AS selections`,
      [community.id],
    )
    expect(rows[0]).toEqual({
      applications: 0,
      questions: 0,
      options: 0,
      answers: 0,
      selections: 0,
    })
  })
})
