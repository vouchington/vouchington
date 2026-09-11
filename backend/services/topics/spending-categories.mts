import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { Topic } from './types.mts'
import { validateOptionalBoolean } from './validation.mts'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { upsertTopicAttributes } from './upsert-attributes.mts'

type SpendingCategoryAttributes = {
  is_foreign_transaction?: boolean
  default_spending_frequency?: 'monthly' | 'annually'
}

export async function getSpendingCategoryAttributes(
  topic: Topic,
): Promise<SpendingCategoryAttributes | null> {
  const { rows } = await read(sql`/* getSpendingCategoryAttributes */
    SELECT
      is_foreign_transaction,
      default_spending_frequency
    FROM topics__spending_categories
    WHERE topic_id = ${topic.id}
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function updateSpendingCategoryAttributes(
  currentUser: PrivateUser | null,
  topic: Topic,
  attributes: SpendingCategoryAttributes,
): Promise<SpendingCategoryAttributes | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')

  const columns: string[] = []
  const values: unknown[] = []

  for (const key of Object.keys(attributes)) {
    switch (key) {
      case 'is_foreign_transaction': {
        const value = attributes.is_foreign_transaction
        validateOptionalBoolean(value, 'is_foreign_transaction')
        columns.push(key)
        values.push(value ?? null)
        break
      }
      case 'default_spending_frequency': {
        const value = attributes.default_spending_frequency
        assert(
          value === undefined || value === null || value === 'monthly' || value === 'annually',
          422,
          'default_spending_frequency must be monthly or annually',
        )
        columns.push(key)
        values.push(value ?? null)
        break
      }
    }
  }

  return await upsertTopicAttributes<SpendingCategoryAttributes>(
    'topics__spending_categories',
    topic.id,
    columns,
    values,
  )
}

export async function replaceSpendingCategoryAttributes(
  currentUser: PrivateUser | null,
  topic: Topic,
  attributes: SpendingCategoryAttributes,
): Promise<SpendingCategoryAttributes | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')

  validateOptionalBoolean(attributes.is_foreign_transaction, 'is_foreign_transaction')
  assert(
    attributes.default_spending_frequency === undefined ||
      attributes.default_spending_frequency === null ||
      attributes.default_spending_frequency === 'monthly' ||
      attributes.default_spending_frequency === 'annually',
    422,
    'default_spending_frequency must be monthly or annually',
  )

  const { rows } = await write(sql`/* replaceSpendingCategoryAttributes */
    INSERT INTO topics__spending_categories (
      topic_id,
      is_foreign_transaction,
      default_spending_frequency
    )
    VALUES (
      ${topic.id},
      ${attributes.is_foreign_transaction ?? false},
      ${attributes.default_spending_frequency ?? 'monthly'}
    )
    ON CONFLICT (topic_id) DO UPDATE
    SET
      is_foreign_transaction = ${attributes.is_foreign_transaction ?? false},
      default_spending_frequency = ${attributes.default_spending_frequency ?? 'monthly'}
    RETURNING *
  `)
  return rows[0] ?? null
}
