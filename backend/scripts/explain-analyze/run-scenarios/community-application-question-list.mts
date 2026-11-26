import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { COMMUNITY_APPLICATION_LIMIT_MAX_VALUES } from '@services/communities/applications/question-limits'
import { getApplicationQuestions } from '@services/communities/applications/questions'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'

export async function runApplicationQuestionListScenario(): Promise<void> {
  const scenario = 'community-application-questions-at-cap'
  const questionCap = COMMUNITY_APPLICATION_LIMIT_MAX_VALUES.questions_per_community
  const { rows: communities } = await write<{ id: string }>(sql`
    /* seedApplicationQuestionListCommunity */
    INSERT INTO communities (name, slug, created_by_id, created_via)
    VALUES ('Explain application question list', ${`explain-application-${randomUUID()}`}, ${seedUser.id}, 'system')
    RETURNING id
  `)
  const communityId = communities[0]!.id

  try {
    // One live form and four retired versions with the same order indexes.
    await write(sql`
      /* seedApplicationQuestionList */
      INSERT INTO community_application_questions (community_id, question, order_index, deleted_at)
      SELECT ${communityId}, 'Question ' || order_index, order_index,
        CASE WHEN version > 0 THEN CURRENT_TIMESTAMP END
      FROM generate_series(0, ${questionCap - 1}) AS orders(order_index)
      CROSS JOIN generate_series(0, 4) AS versions(version)
    `)
    await write('/* analyzeApplicationQuestionList */ ANALYZE community_application_questions')

    registerScenarioContract(scenario, {
      expectations: [
        { kind: 'usesIndexes', indexes: ['idx_community_application_questions__comm_order'] },
        { kind: 'maxProcessedRows', relation: 'community_application_questions', max: questionCap },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const questions = await getApplicationQuestions(communityId)
        if (
          questions.length !== questionCap ||
          questions.some((question, index) => question.order_index !== index || question.deleted_at)
        ) {
          throw new Error('The form must return all live questions in order at the hard cap')
        }
      },
      undefined,
      'getApplicationQuestions',
      { exactCapturedNames: ['getApplicationQuestions'] },
    )
  } finally {
    await write(sql`/* deleteApplicationQuestionListCommunity */
      DELETE FROM communities WHERE id = ${communityId}`)
  }
}
