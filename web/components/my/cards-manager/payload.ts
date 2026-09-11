import type { IndividualCard, UpdateMyCardBody } from '@/types/my'
import type { CardEditForm } from './types'
import { majorUnitsInputValue } from '@/lib/money'
import { parseMajorUnitsToMoney } from '@ts-shared/money'
import { normalizeLocalizedMajorUnitDraft } from '@/lib/money-input-draft'

export function cardToEditForm(card: IndividualCard): CardEditForm {
  return {
    opened_on: card.opened_on ?? '',
    closed_on: card.closed_on ?? '',
    received_sign_up_bonus_on: card.received_sign_up_bonus_on ?? '',
    credit_limit: card.credit_limit ? majorUnitsInputValue(card.credit_limit) : '',
    currency: card.credit_limit?.currency ?? 'usd',
    is_authorized_user: card.is_authorized_user,
    authorized_user_of_id: card.authorized_user_of_id ?? '',
    note: card.note ?? '',
  }
}

export function buildCardUpdatePayload(
  original: IndividualCard | undefined,
  editForm: CardEditForm,
  locale: string,
): UpdateMyCardBody | null | 'invalid-credit-limit' {
  const payload: UpdateMyCardBody = {}
  const opened_on = editForm.opened_on || null
  const closed_on = editForm.closed_on || null
  const received_sign_up_bonus_on = editForm.received_sign_up_bonus_on || null
  const creditLimitDraft = editForm.credit_limit.trim()
  let credit_limit = null
  try {
    credit_limit =
      creditLimitDraft === ''
        ? null
        : parseMajorUnitsToMoney(
            normalizeLocalizedMajorUnitDraft(creditLimitDraft, locale),
            editForm.currency,
          )
  } catch {
    return 'invalid-credit-limit'
  }
  const authorized_user_of_id = editForm.authorized_user_of_id || null
  const note = editForm.note || null
  if (!original || opened_on !== original.opened_on) payload.opened_on = opened_on
  if (!original || closed_on !== original.closed_on) payload.closed_on = closed_on
  if (!original || received_sign_up_bonus_on !== original.received_sign_up_bonus_on) {
    payload.received_sign_up_bonus_on = received_sign_up_bonus_on
  }
  if (!original || !sameMoney(credit_limit, original.credit_limit)) {
    payload.credit_limit = credit_limit
  }
  if (!original || editForm.is_authorized_user !== original.is_authorized_user) {
    payload.is_authorized_user = editForm.is_authorized_user
    if (!editForm.is_authorized_user && original?.authorized_user_of_id) {
      payload.authorized_user_of_id = null
    }
  }
  if (!original || authorized_user_of_id !== original.authorized_user_of_id) {
    payload.authorized_user_of_id = authorized_user_of_id
  }
  if (!original || note !== original.note) payload.note = note
  return Object.keys(payload).length === 0 ? null : payload
}

function sameMoney(
  left: UpdateMyCardBody['credit_limit'],
  right: IndividualCard['credit_limit'],
): boolean {
  return (
    left === right ||
    (left !== null &&
      left !== undefined &&
      right !== null &&
      left.amount === right.amount &&
      left.currency === right.currency)
  )
}
