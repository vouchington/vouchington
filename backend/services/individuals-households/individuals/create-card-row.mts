import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { withTopicReferenceAttachmentFences } from '@services/post-publication/lock'

type IndividualCardCreationRow = {
  card_id: string | null
  individual_id: string | null
  topic_exists: boolean
}

export async function createIndividualCardRow(
  userId: string,
  cardId: string,
): Promise<IndividualCardCreationRow> {
  let rows: IndividualCardCreationRow[]
  try {
    ;({ rows } = await withTopicReferenceAttachmentFences([cardId], {}, query =>
      write<IndividualCardCreationRow>(
        sql`/* createIndividualCard */
      WITH valid_topic AS MATERIALIZED (
        SELECT id
        FROM topics
        WHERE id = ${cardId}
          AND topic_type = 'card'
          AND deleted_at IS NULL
          AND merged_into_topic_id IS NULL
        LIMIT 1
      ),
      user_individual AS MATERIALIZED (
        SELECT id, individual_id
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      ),
      new_individual AS (
        INSERT INTO individuals (id)
        SELECT uuidv7()
        WHERE EXISTS (SELECT 1 FROM valid_topic)
          AND EXISTS (SELECT 1 FROM user_individual WHERE individual_id IS NULL)
        RETURNING id
      ),
      updated_user AS (
        UPDATE users
        SET individual_id = new_individual.id
        FROM new_individual
        WHERE users.id = ${userId}
        RETURNING new_individual.id
      ),
      individual AS MATERIALIZED (
        SELECT individual_id AS id
        FROM user_individual
        WHERE individual_id IS NOT NULL
        UNION ALL
        SELECT id FROM updated_user
      ),
      inserted_card AS (
        INSERT INTO individual_cards (individual_id, card_topic_id)
        SELECT individual.id, valid_topic.id
        FROM individual
        CROSS JOIN valid_topic
        RETURNING id
      )
      SELECT
        (SELECT id FROM inserted_card LIMIT 1) AS card_id,
        (SELECT id FROM individual LIMIT 1) AS individual_id,
        EXISTS (SELECT 1 FROM valid_topic) AS topic_exists
    `,
        { query },
      ),
    ))
  } catch (err) {
    const pgError = err as { code?: string; constraint?: string }
    if (pgError.code === '23503' && pgError.constraint === 'individual_cards_card_topic_id_fkey') {
      assert(false, 404, 'Topic not found')
    }
    if (pgError.code === '23503') assert(false, 422, 'Invalid card_topic_id')
    throw err
  }
  return rows[0]!
}
