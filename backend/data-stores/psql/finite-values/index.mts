import type { EXISTING_FINITE_VALUES_1 } from './existing-1.mts'
import type { EXISTING_FINITE_VALUES_2 } from './existing-2.mts'
import type { EXISTING_FINITE_VALUES_3 } from './existing-3.mts'
import type { EXISTING_FINITE_VALUES_4 } from './existing-4.mts'
import type { EXISTING_FINITE_VALUES_5 } from './existing-5.mts'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import { CURRENCIES } from '@ts-shared/money'

import { COPYRIGHT_FINITE_VALUES } from './copyright.mts'
import { DOMAIN_FINITE_VALUES } from './domains.mts'
import { GENERAL_FINITE_VALUES } from './general.mts'

export const GENERATED_FINITE_VALUES = {
  api_scopes: (Object.keys(SCOPE_DEFINITIONS) as ApiScope[]).toSorted(),
  currency_codes: CURRENCIES.map(currency => currency.code).toSorted(),
  oauth_grant_types: ['authorization_code', 'refresh_token'],
  oauth_response_types: ['code'],
  ...COPYRIGHT_FINITE_VALUES,
  ...GENERAL_FINITE_VALUES,
  ...DOMAIN_FINITE_VALUES,
} as const

type FiniteValues = typeof GENERATED_FINITE_VALUES &
  typeof EXISTING_FINITE_VALUES_1 &
  typeof EXISTING_FINITE_VALUES_2 &
  typeof EXISTING_FINITE_VALUES_3 &
  typeof EXISTING_FINITE_VALUES_4 &
  typeof EXISTING_FINITE_VALUES_5

export type FiniteValue<Name extends keyof FiniteValues> = FiniteValues[Name][number]
