export interface CardEditForm {
  opened_on: string
  closed_on: string
  received_sign_up_bonus_on: string
  credit_limit: string
  currency: CurrencyCode
  is_authorized_user: boolean
  authorized_user_of_id: string
  note: string
}
import type { CurrencyCode } from '@ts-shared/money'
