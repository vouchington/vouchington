import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'
import { normalizeCountryCode } from '@ts-shared/languages/countries'
import { normalizeUiLocale } from '@ts-shared/languages/ui-locales'
import { appendSet } from './update-fields-visibility.mts'

export function appendCountryField(
  query: SQLStatement,
  hasSet: boolean,
  country: string | null | undefined,
) {
  if (country === undefined) return hasSet

  assert(country === null || typeof country === 'string', 422, 'country must be a string or null')
  if (country === null) return appendSet(query, hasSet, sql`country = NULL`)

  const normalized = normalizeCountryCode(country)
  assert(normalized !== null, 422, 'Invalid country: not a supported ISO 3166-1 alpha-2 code')
  return appendSet(query, hasSet, sql`country = ${normalized}`)
}

export function appendUiLocaleField(
  query: SQLStatement,
  hasSet: boolean,
  uiLocale: string | null | undefined,
) {
  if (uiLocale === undefined) return hasSet

  assert(
    uiLocale === null || typeof uiLocale === 'string',
    422,
    'ui_locale must be a string or null',
  )
  if (uiLocale === null) return appendSet(query, hasSet, sql`ui_locale = NULL`)

  const normalized = normalizeUiLocale(uiLocale)
  assert(normalized !== null, 422, 'Invalid ui_locale: not a supported UI locale')
  return appendSet(query, hasSet, sql`ui_locale = ${normalized}`)
}
