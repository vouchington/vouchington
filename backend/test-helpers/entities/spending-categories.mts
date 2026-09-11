import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { insertTestTopic } from './topics.mts'
import { createRandomString } from '../data.mts'
import type { Money } from '@ts-shared/money'

const DEFAULT_SPENDING_AMOUNT = { amount: 100, currency: 'usd' } satisfies Money

/**
 * Insert a test spending category topic
 */
export async function insertTestSpendingCategory(data: {
  name?: string
  createdById: string
}): Promise<string> {
  const slug = `spending-${createRandomString(10)}`
  const name = data.name || `Test Spending Category ${createRandomString(8)}`
  const topicId = await insertTestTopic({
    name,
    slug,
    createdById: data.createdById,
  })

  // Insert into topics__spending_categories table
  await write(sql`
    INSERT INTO topics__spending_categories (topic_id)
    VALUES (${topicId})
  `)

  return topicId
}

export async function insertTestSpendingEntry(data: {
  individualId: string
  spendingCategoryId: string
  amount?: Money
}): Promise<void> {
  const amount = data.amount ?? DEFAULT_SPENDING_AMOUNT
  await write(sql`
    INSERT INTO spending_entries (
      individual_id, spending_category_id, amount_minor_units, currency_code
    )
    VALUES (
      ${data.individualId}, ${data.spendingCategoryId}, ${amount.amount}, ${amount.currency}
    )
  `)
}

export async function insertTestHouseholdSpendingEntry(data: {
  householdId: string
  spendingCategoryId: string
  amount?: Money
}): Promise<void> {
  const amount = data.amount ?? DEFAULT_SPENDING_AMOUNT
  await write(sql`
    INSERT INTO spending_entries (
      household_id, spending_category_id, amount_minor_units, currency_code
    )
    VALUES (
      ${data.householdId}, ${data.spendingCategoryId}, ${amount.amount}, ${amount.currency}
    )
  `)
}
