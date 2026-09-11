import * as AjvModule from 'ajv'
import * as addFormatsModule from 'ajv-formats'
import assert from 'http-assert'
import {
  CREDIT_CARD_SCHEMA,
  BANK_ACCOUNT_SCHEMA,
  DEFAULT_DATA_POINT_TOPIC_IDS_MAX_ITEMS,
  createCreditCardSchema,
  createBankAccountSchema,
} from '@ts-shared/data-points'
import type { StructuredDataPoint } from './types.mts'
import { isValidVertical } from './verticals.mts'
import { isMoney, isMoneyRange, type CurrencyCode } from '@ts-shared/money'

type AjvConstructor = typeof AjvModule.Ajv
type AddFormats = (ajv: InstanceType<AjvConstructor>) => InstanceType<AjvConstructor>

const AjvCtor = (AjvModule.default ?? AjvModule) as unknown as AjvConstructor
const addFormats = (addFormatsModule.default ?? addFormatsModule) as unknown as AddFormats

// Compile schemas once at module load — validation is synchronous after this.
const ajv = new AjvCtor({ allErrors: false })
addFormats(ajv)

const validateCreditCard = ajv.compile(CREDIT_CARD_SCHEMA)
const validateBankAccount = ajv.compile(BANK_ACCOUNT_SCHEMA)
const validatorsByTopicIdsMaxItems = new Map<
  number,
  {
    validateBankAccount: typeof validateBankAccount
    validateCreditCard: typeof validateCreditCard
  }
>()

export type StructuredDataValidationOptions = {
  topicIdsMaxItems?: number
}

function firstAjvError(errors: typeof ajv.errors): string {
  const err = errors?.[0]
  if (!err) return 'structured_data is invalid'
  const field = err.instancePath
    ? `structured_data${err.instancePath.replace(/\//g, '.')}`
    : 'structured_data'
  return `${field} ${err.message ?? 'is invalid'}`
}

export function assertValidStructuredData(
  vertical: string,
  data: unknown,
  options: StructuredDataValidationOptions = {},
): StructuredDataPoint {
  assert(isValidVertical(vertical), 422, 'Invalid data_point_vertical')
  assert(
    data !== null && typeof data === 'object' && !Array.isArray(data),
    422,
    'structured_data must be an object',
  )

  const validators = getValidators(options.topicIdsMaxItems)
  const validate =
    vertical === 'credit_card' ? validators.validateCreditCard : validators.validateBankAccount
  const valid = validate(data)
  assert(valid, 422, firstAjvError(validate.errors))
  assertOneStructuredDataCurrency(data as StructuredDataPoint)

  return data as StructuredDataPoint
}

function assertOneStructuredDataCurrency(data: StructuredDataPoint): void {
  const currencies: CurrencyCode[] = [data.currency]
  if (data.stated_income_range != null) {
    assert(
      isMoneyRange(data.stated_income_range),
      422,
      'stated_income_range must be a valid money range',
    )
    currencies.push(data.stated_income_range.minimum.currency)
    if (data.stated_income_range.maximum) {
      currencies.push(data.stated_income_range.maximum.currency)
    }
  }
  const monetaryValues =
    data.vertical === 'credit_card'
      ? [data.credit_limit, data.total_credit_limit_all_cards]
      : [data.bonus_amount, data.minimum_balance_requirement]
  for (const money of monetaryValues) {
    if (isMoney(money)) currencies.push(money.currency)
  }
  assert(
    currencies.every(currency => currency === data.currency),
    422,
    'all structured_data money must use structured_data.currency',
  )
}

function getValidators(topicIdsMaxItems = DEFAULT_DATA_POINT_TOPIC_IDS_MAX_ITEMS) {
  if (topicIdsMaxItems === DEFAULT_DATA_POINT_TOPIC_IDS_MAX_ITEMS) {
    return { validateBankAccount, validateCreditCard }
  }
  const existing = validatorsByTopicIdsMaxItems.get(topicIdsMaxItems)
  if (existing) return existing
  const validators = {
    validateBankAccount: ajv.compile(createBankAccountSchema({ topicIdsMaxItems })),
    validateCreditCard: ajv.compile(createCreditCardSchema({ topicIdsMaxItems })),
  }
  validatorsByTopicIdsMaxItems.set(topicIdsMaxItems, validators)
  return validators
}
