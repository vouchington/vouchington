import { EXISTING_FINITE_VALUES_1 } from './existing-1.mts'
import { EXISTING_FINITE_VALUES_2 } from './existing-2.mts'
import { EXISTING_FINITE_VALUES_3 } from './existing-3.mts'
import { EXISTING_FINITE_VALUES_4 } from './existing-4.mts'
import { EXISTING_FINITE_VALUES_5 } from './existing-5.mts'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'

import { COPYRIGHT_FINITE_VALUES } from './copyright.mts'
import { DOMAIN_FINITE_VALUES } from './domains.mts'
import { GENERAL_FINITE_VALUES } from './general.mts'

export const GENERATED_FINITE_VALUES = {
  api_scopes: (Object.keys(SCOPE_DEFINITIONS) as ApiScope[]).toSorted(),
  oauth_grant_types: ['authorization_code', 'refresh_token'],
  oauth_response_types: ['code'],
  ...COPYRIGHT_FINITE_VALUES,
  ...GENERAL_FINITE_VALUES,
  ...DOMAIN_FINITE_VALUES,
} as const

export const FINITE_VALUES = {
  ...GENERATED_FINITE_VALUES,
  ...EXISTING_FINITE_VALUES_1,
  ...EXISTING_FINITE_VALUES_2,
  ...EXISTING_FINITE_VALUES_3,
  ...EXISTING_FINITE_VALUES_4,
  ...EXISTING_FINITE_VALUES_5,
} as const

export type FiniteValue<Name extends keyof typeof FINITE_VALUES> =
  (typeof FINITE_VALUES)[Name][number]
