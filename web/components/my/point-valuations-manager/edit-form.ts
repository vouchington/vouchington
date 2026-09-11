import { majorUnitsInputValue } from '@/lib/money'
import type { PointValuation } from '@/types/my'
import {
  MAX_POINT_VALUE_MICROUNITS,
  parseMajorUnitsToScaledMoney,
  type CurrencyCode,
  type ScaledMoney,
} from '@ts-shared/money'
import { normalizeLocalizedMajorUnitDraft } from '@/lib/money-input-draft'

export type PointValuationEditForm = {
  value_per_point: string
  currency: CurrencyCode
  note: string
}

export function pointValuationEditForm(valuation: PointValuation): PointValuationEditForm {
  return {
    value_per_point: majorUnitsInputValue(valuation.value_per_point),
    currency: valuation.value_per_point.currency,
    note: valuation.note ?? '',
  }
}

export function parsePointValuationInput(
  value: string,
  currency: CurrencyCode,
  locale: string,
): ScaledMoney {
  const parsed = parseMajorUnitsToScaledMoney(
    normalizeLocalizedMajorUnitDraft(value, locale),
    currency,
  )
  if (parsed.amount > MAX_POINT_VALUE_MICROUNITS) {
    throw new RangeError('Point valuation exceeds the supported maximum')
  }
  return parsed
}

export function pointValuationUpdatePayload(
  original: PointValuation | undefined,
  valuePerPoint: ScaledMoney,
  note: string | null,
): { value_per_point?: ScaledMoney; note?: string | null } {
  const payload: { value_per_point?: ScaledMoney; note?: string | null } = {}
  if (
    !original ||
    valuePerPoint.amount !== original.value_per_point.amount ||
    valuePerPoint.currency !== original.value_per_point.currency
  ) {
    payload.value_per_point = valuePerPoint
  }
  if (!original || note !== original.note) payload.note = note
  return payload
}
