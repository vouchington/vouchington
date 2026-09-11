import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { Topic } from './types.mts'
import { assertTopicExists } from './validation.mts'
import { currentUserCanUpdateTopic } from './authorization.mts'
import { upsertTopicAttributes } from './upsert-attributes.mts'
import { isMoney, parsePostgresMoneyAmount, type CurrencyCode, type Money } from '@ts-shared/money'
import { mapCardAttributeReferenceError } from './card-attribute-errors.mts'

type CardAttributes = {
  bank_id?: string | null
  brand_id?: string | null
  annual_fee?: Money | null
}

type CardAttributesRow = Omit<CardAttributes, 'annual_fee'> & {
  annual_fee_minor_units: string | null
  currency_code: CurrencyCode | null
}

function toCardAttributes(row: CardAttributesRow): CardAttributes {
  return {
    bank_id: row.bank_id,
    brand_id: row.brand_id,
    annual_fee:
      row.annual_fee_minor_units === null || row.currency_code === null
        ? null
        : {
            amount: parsePostgresMoneyAmount(row.annual_fee_minor_units),
            currency: row.currency_code,
          },
  }
}

export async function getCardAttributes(topic: Topic): Promise<CardAttributes | null> {
  assert(topic.topic_type === 'card', 400, 'Topic is not a card')

  const { rows } = await read<CardAttributesRow>(sql`/* getCardAttributes */
    SELECT
      bank_id,
      brand_id,
      annual_fee_minor_units::TEXT AS annual_fee_minor_units,
      currency_code
    FROM topics__cards
    WHERE topic_id = ${topic.id}
    LIMIT 1
  `)
  return rows[0] ? toCardAttributes(rows[0]) : null
}

export async function updateCardAttributes(
  currentUser: PrivateUser | null,
  topic: Topic,
  attributes: CardAttributes,
): Promise<CardAttributes | null> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  assert(topic.topic_type === 'card', 400, 'Topic is not a card')

  const columns: string[] = []
  const values: unknown[] = []

  if ('bank_id' in attributes) {
    if (attributes.bank_id != null) await assertTopicExists(attributes.bank_id, 'bank_id')
    columns.push('bank_id')
    values.push(attributes.bank_id ?? null)
  }
  if ('brand_id' in attributes) {
    if (attributes.brand_id != null) await assertTopicExists(attributes.brand_id, 'brand_id')
    columns.push('brand_id')
    values.push(attributes.brand_id ?? null)
  }
  if ('annual_fee' in attributes) {
    assert(
      attributes.annual_fee === null || isMoney(attributes.annual_fee),
      422,
      'annual_fee must be valid money or null',
    )
    columns.push('annual_fee_minor_units', 'currency_code')
    values.push(attributes.annual_fee?.amount ?? null, attributes.annual_fee?.currency ?? null)
  }

  const row = await mapCardAttributeReferenceError(() =>
    upsertTopicAttributes<CardAttributesRow>('topics__cards', topic.id, columns, values),
  )
  return row ? toCardAttributes(row) : null
}
