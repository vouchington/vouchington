import { toast } from 'sonner'
import { updateMyFinancialProfile } from '@/lib/api/client/financial-profile'
import type { StructuredDataState } from '../data-point-fields'
import type { CurrencyCode, Money, MoneyRange } from '@ts-shared/money'
import type { FinancialProfile } from '@/types/my'

export async function updateProfileFromStructuredData(
  structuredData: StructuredDataState,
  currentProfile?: FinancialProfile | null,
): Promise<void> {
  try {
    const profilePayload: Parameters<typeof updateMyFinancialProfile>[0] = {}
    const changesExistingCurrency =
      structuredData.currency !== undefined &&
      currentProfile !== null &&
      currentProfile !== undefined &&
      structuredData.currency !== currentProfile.currency
    if (structuredData.currency !== undefined)
      profilePayload.currency = structuredData.currency as CurrencyCode
    if (structuredData.credit_score_range !== undefined)
      profilePayload.credit_score_range = structuredData.credit_score_range as string | null
    if (structuredData.stated_income_range !== undefined)
      profilePayload.stated_income_range = structuredData.stated_income_range as MoneyRange | null
    if (structuredData.total_credit_limit_all_cards !== undefined)
      profilePayload.total_credit_limit =
        structuredData.total_credit_limit_all_cards as Money | null
    if (changesExistingCurrency) {
      profilePayload.stated_income_range =
        structuredData.stated_income_range === undefined
          ? null
          : (structuredData.stated_income_range as MoneyRange | null)
      profilePayload.total_credit_limit =
        structuredData.total_credit_limit_all_cards === undefined
          ? null
          : (structuredData.total_credit_limit_all_cards as Money | null)
    }
    if (structuredData.years_of_credit_history !== undefined)
      profilePayload.years_of_credit_history = structuredData.years_of_credit_history as
        | number
        | null
    if (structuredData.hard_inquiries_12m !== undefined)
      profilePayload.hard_inquiries_12m = structuredData.hard_inquiries_12m as number | null
    if (structuredData.cards_opened_24m !== undefined)
      profilePayload.cards_opened_24m = structuredData.cards_opened_24m as number | null
    if (Object.keys(profilePayload).length > 0) await updateMyFinancialProfile(profilePayload)
  } catch {
    toast.error(
      'Post saved, but profile could not be updated. Please update your profile manually.',
    )
  }
}
