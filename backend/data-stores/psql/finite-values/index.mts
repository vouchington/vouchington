import type { ExistingFiniteValues } from './existing.mts'
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

type FiniteValues = typeof GENERATED_FINITE_VALUES & ExistingFiniteValues

export type FiniteValue<Name extends keyof FiniteValues> = FiniteValues[Name][number]
