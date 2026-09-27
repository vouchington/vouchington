import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { toDataPointFactColumns } from './fact-columns.mts'
import type { StructuredDataPoint } from './types.mts'

export async function persistPostDataPointFacts(
  postId: string,
  data: StructuredDataPoint,
  options: QueryOptions,
): Promise<void> {
  const facts = toDataPointFactColumns(data)
  await write(
    sql`/* persistPostDataPointFacts */
      INSERT INTO post_data_point_facts (
        post_id, vertical, schema_version, result, currency,
        credit_score_range, credit_score_range_presence,
        stated_income_range_presence, stated_income_minimum_amount, stated_income_minimum_currency,
        stated_income_maximum_presence, stated_income_maximum_amount, stated_income_maximum_currency,
        existing_relationship,
        hard_inquiries_12m, hard_inquiries_12m_presence,
        cards_opened_24m, cards_opened_24m_presence,
        credit_limit_amount, credit_limit_currency, credit_limit_presence,
        total_credit_limit_amount, total_credit_limit_currency, total_credit_limit_presence,
        years_of_credit_history, years_of_credit_history_presence,
        is_business_application,
        application_method, application_method_presence,
        application_date, application_date_presence,
        account_type, account_type_presence,
        bonus_amount, bonus_currency, bonus_amount_presence,
        bonus_requirements, bonus_requirements_presence,
        minimum_balance_amount, minimum_balance_currency, minimum_balance_presence,
        direct_deposit_setup
      ) VALUES (
        ${postId}, ${facts.vertical}, ${facts.schemaVersion}, ${facts.result}, ${facts.currency},
        ${facts.creditScoreRange}, ${facts.creditScoreRangePresence},
        ${facts.statedIncome.presence}, ${facts.statedIncome.minimumAmount},
        ${facts.statedIncome.minimumCurrency}, ${facts.statedIncome.maximumPresence},
        ${facts.statedIncome.maximumAmount}, ${facts.statedIncome.maximumCurrency},
        ${facts.existingRelationship},
        ${facts.hardInquiries12m}, ${facts.hardInquiries12mPresence},
        ${facts.cardsOpened24m}, ${facts.cardsOpened24mPresence},
        ${facts.creditLimit.amount}, ${facts.creditLimit.currency}, ${facts.creditLimit.presence},
        ${facts.totalCreditLimit.amount}, ${facts.totalCreditLimit.currency},
        ${facts.totalCreditLimit.presence},
        ${facts.yearsOfCreditHistory}, ${facts.yearsOfCreditHistoryPresence},
        ${facts.isBusinessApplication},
        ${facts.applicationMethod}, ${facts.applicationMethodPresence},
        ${facts.applicationDate}, ${facts.applicationDatePresence},
        ${facts.accountType}, ${facts.accountTypePresence},
        ${facts.bonusAmount.amount}, ${facts.bonusAmount.currency}, ${facts.bonusAmount.presence},
        ${facts.bonusRequirements}, ${facts.bonusRequirementsPresence},
        ${facts.minimumBalance.amount}, ${facts.minimumBalance.currency},
        ${facts.minimumBalance.presence},
        ${facts.directDepositSetup}
      )
      ON CONFLICT (post_id) DO UPDATE SET
        vertical = EXCLUDED.vertical,
        schema_version = EXCLUDED.schema_version,
        result = EXCLUDED.result,
        currency = EXCLUDED.currency,
        credit_score_range = EXCLUDED.credit_score_range,
        credit_score_range_presence = EXCLUDED.credit_score_range_presence,
        stated_income_range_presence = EXCLUDED.stated_income_range_presence,
        stated_income_minimum_amount = EXCLUDED.stated_income_minimum_amount,
        stated_income_minimum_currency = EXCLUDED.stated_income_minimum_currency,
        stated_income_maximum_presence = EXCLUDED.stated_income_maximum_presence,
        stated_income_maximum_amount = EXCLUDED.stated_income_maximum_amount,
        stated_income_maximum_currency = EXCLUDED.stated_income_maximum_currency,
        existing_relationship = EXCLUDED.existing_relationship,
        hard_inquiries_12m = EXCLUDED.hard_inquiries_12m,
        hard_inquiries_12m_presence = EXCLUDED.hard_inquiries_12m_presence,
        cards_opened_24m = EXCLUDED.cards_opened_24m,
        cards_opened_24m_presence = EXCLUDED.cards_opened_24m_presence,
        credit_limit_amount = EXCLUDED.credit_limit_amount,
        credit_limit_currency = EXCLUDED.credit_limit_currency,
        credit_limit_presence = EXCLUDED.credit_limit_presence,
        total_credit_limit_amount = EXCLUDED.total_credit_limit_amount,
        total_credit_limit_currency = EXCLUDED.total_credit_limit_currency,
        total_credit_limit_presence = EXCLUDED.total_credit_limit_presence,
        years_of_credit_history = EXCLUDED.years_of_credit_history,
        years_of_credit_history_presence = EXCLUDED.years_of_credit_history_presence,
        is_business_application = EXCLUDED.is_business_application,
        application_method = EXCLUDED.application_method,
        application_method_presence = EXCLUDED.application_method_presence,
        application_date = EXCLUDED.application_date,
        application_date_presence = EXCLUDED.application_date_presence,
        account_type = EXCLUDED.account_type,
        account_type_presence = EXCLUDED.account_type_presence,
        bonus_amount = EXCLUDED.bonus_amount,
        bonus_currency = EXCLUDED.bonus_currency,
        bonus_amount_presence = EXCLUDED.bonus_amount_presence,
        bonus_requirements = EXCLUDED.bonus_requirements,
        bonus_requirements_presence = EXCLUDED.bonus_requirements_presence,
        minimum_balance_amount = EXCLUDED.minimum_balance_amount,
        minimum_balance_currency = EXCLUDED.minimum_balance_currency,
        minimum_balance_presence = EXCLUDED.minimum_balance_presence,
        direct_deposit_setup = EXCLUDED.direct_deposit_setup,
        updated_at = CURRENT_TIMESTAMP
    `,
    options,
  )
}
