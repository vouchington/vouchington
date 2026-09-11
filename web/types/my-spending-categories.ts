import type { Money } from '@ts-shared/money'

export type SpendingFrequency = 'monthly' | 'annually'

export interface CreateMySpendingCategoryBody {
  spending_category_id: string
  amount: Money
  spending_frequency?: SpendingFrequency
  household_id?: string
  note?: string
}

type SpendingCategoryUpdateFields = {
  amount: Money
  spending_frequency: SpendingFrequency
  note: string | null
}

export type UpdateMySpendingCategoryBody = {
  [Field in keyof SpendingCategoryUpdateFields]: Pick<SpendingCategoryUpdateFields, Field> &
    Partial<Omit<SpendingCategoryUpdateFields, Field>>
}[keyof SpendingCategoryUpdateFields]

export interface SpendingCategory {
  id: string
  spending_category_id: string
  amount: Money
  spending_frequency: SpendingFrequency
  note: string | null
  owner_type?: 'individual' | 'household'
  can_manage?: boolean
  spending_category: {
    id: string
    name: string
    slug: string
  }
}
