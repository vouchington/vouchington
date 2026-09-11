/**
 * JSON Schema (Draft-07) definitions for structured data point verticals.
 *
 * These are the authoritative validation schemas. The backend uses them with
 * `ajv` to validate API input. The frontend can import them for client-side
 * validation or to drive form field constraints.
 *
 * Allowed values are derived from `schemas.mts` — do not duplicate them here.
 */

import {
  CREDIT_CARD_RESULTS,
  CREDIT_SCORE_RANGES,
  APPLICATION_METHODS,
  BANK_ACCOUNT_RESULTS,
  BANK_ACCOUNT_TYPES,
  SUPPORTED_CURRENCIES,
} from './schemas.mts'
import { MAX_MONEY_AMOUNT } from '@ts-shared/money'

const creditScoreRangeValues = CREDIT_SCORE_RANGES.map(o => o.value)
const currencyCodeValues = SUPPORTED_CURRENCIES.map(option => option.value)
export const DEFAULT_DATA_POINT_TOPIC_IDS_MAX_ITEMS = 5

type DataPointSchemaOptions = {
  topicIdsMaxItems?: number
}

// ---------------------------------------------------------------------------
// Shared sub-schemas used by multiple verticals
// ---------------------------------------------------------------------------

const topicIdSchema = { type: 'string', format: 'uuid' }

function createTopicIdsSchema(maxItems = DEFAULT_DATA_POINT_TOPIC_IDS_MAX_ITEMS) {
  return { type: 'array', items: topicIdSchema, minItems: 1, maxItems, uniqueItems: true }
}

export const currencyCodeSchema = {
  type: 'string',
  enum: currencyCodeValues,
}

export const moneySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['amount', 'currency'],
  properties: {
    amount: { type: 'integer', minimum: 0, maximum: MAX_MONEY_AMOUNT },
    currency: currencyCodeSchema,
  },
}

export const moneyRangeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['minimum', 'maximum'],
  properties: {
    minimum: moneySchema,
    maximum: { anyOf: [{ type: 'null' }, moneySchema] },
  },
}

const creditScoreRangeSchema = {
  type: 'string',
  enum: creditScoreRangeValues,
}

const applicationDateSchema = {
  type: 'string',
  format: 'date',
}

// Nullable variants — used for optional fields the UI sends null when cleared.
const nullableMoney = { anyOf: [{ type: 'null' }, moneySchema] }
const nullableMoneyRange = { anyOf: [{ type: 'null' }, moneyRangeSchema] }
const nullableCreditScoreRange = { anyOf: [{ type: 'null' }, creditScoreRangeSchema] }
const nullableApplicationDate = { anyOf: [{ type: 'null' }, applicationDateSchema] }
const nullableNonNegativeInt = { anyOf: [{ type: 'null' }, { type: 'integer', minimum: 0 }] }

// ---------------------------------------------------------------------------
// Credit card
// ---------------------------------------------------------------------------

export function createCreditCardSchema(options: DataPointSchemaOptions = {}) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    required: [
      'vertical',
      'schema_version',
      'topic_ids',
      'result',
      'credit_score_range',
      'currency',
    ],
    properties: {
      vertical: { type: 'string', const: 'credit_card' },
      schema_version: { type: 'integer', const: 1 },
      topic_ids: createTopicIdsSchema(options.topicIdsMaxItems),
      result: { type: 'string', enum: CREDIT_CARD_RESULTS.map(o => o.value) },
      currency: currencyCodeSchema,
      credit_score_range: creditScoreRangeSchema,
      stated_income_range: nullableMoneyRange,
      existing_relationship: { type: 'boolean' },
      hard_inquiries_12m: nullableNonNegativeInt,
      cards_opened_24m: nullableNonNegativeInt,
      credit_limit: nullableMoney,
      total_credit_limit_all_cards: nullableMoney,
      years_of_credit_history: {
        anyOf: [{ type: 'null' }, { type: 'integer', minimum: 0, maximum: 100 }],
      },
      is_business_application: { type: 'boolean' },
      application_method: {
        anyOf: [{ type: 'null' }, { type: 'string', enum: APPLICATION_METHODS.map(o => o.value) }],
      },
      application_date: nullableApplicationDate,
    },
  } as const
}

export const CREDIT_CARD_SCHEMA = createCreditCardSchema()

// ---------------------------------------------------------------------------
// Bank account
// ---------------------------------------------------------------------------

export function createBankAccountSchema(options: DataPointSchemaOptions = {}) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    required: ['vertical', 'schema_version', 'topic_ids', 'result', 'currency'],
    properties: {
      vertical: { type: 'string', const: 'bank_account' },
      schema_version: { type: 'integer', const: 1 },
      topic_ids: createTopicIdsSchema(options.topicIdsMaxItems),
      result: { type: 'string', enum: BANK_ACCOUNT_RESULTS.map(o => o.value) },
      currency: currencyCodeSchema,
      account_type: {
        anyOf: [{ type: 'null' }, { type: 'string', enum: BANK_ACCOUNT_TYPES.map(o => o.value) }],
      },
      credit_score_range: nullableCreditScoreRange,
      stated_income_range: nullableMoneyRange,
      existing_relationship: { type: 'boolean' },
      bonus_amount: nullableMoney,
      bonus_requirements: { anyOf: [{ type: 'null' }, { type: 'string', maxLength: 500 }] },
      minimum_balance_requirement: nullableMoney,
      direct_deposit_setup: { type: 'boolean' },
      application_date: nullableApplicationDate,
    },
  } as const
}

export const BANK_ACCOUNT_SCHEMA = createBankAccountSchema()
