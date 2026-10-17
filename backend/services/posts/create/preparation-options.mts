import type { TransactionQuery } from '@data-stores/psql'
import type { CreatePostDefaults } from './validation.mts'

export type PostPreparationOptions = {
  query?: TransactionQuery
  delegated?: boolean
  /** Validation completed by this admission attempt before capacity and challenge checks. */
  validatedDefaults?: CreatePostDefaults
}
