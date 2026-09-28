import type { QueryExecutor } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'

declare const copyrightDeliveryCountryCodeBrand: unique symbol

/** Supported ISO 3166-1 alpha-2 code named by a copyright ground. The country lookup is the set. */
export type CopyrightDeliveryCountryCode = string & {
  readonly [copyrightDeliveryCountryCodeBrand]: true
}

/** Finite delivery scope of one copyright ground. Country sets are non-empty. */
export type CopyrightGroundApplicability =
  | { readonly scope: 'global' }
  | {
      readonly scope: 'countries'
      readonly countryCodes: readonly [
        CopyrightDeliveryCountryCode,
        ...CopyrightDeliveryCountryCode[],
      ]
    }

export function copyrightGroundApplicability(
  applicability:
    | { readonly scope: 'global' }
    | { readonly scope: 'countries'; readonly countryCodes: readonly string[] },
): CopyrightGroundApplicability {
  if (applicability.scope === 'global') return { scope: 'global' }
  const countryCodes = [
    ...new Set(applicability.countryCodes.map(copyrightDeliveryCountryCode)),
  ].sort() as [CopyrightDeliveryCountryCode, ...CopyrightDeliveryCountryCode[]]
  assert(countryCodes.length > 0, 422, 'Country-set copyright applicability requires a country')
  return { scope: 'countries', countryCodes }
}

export async function insertCopyrightRestrictionCountries(
  query: QueryExecutor,
  restrictionId: string,
  applicability: CopyrightGroundApplicability,
): Promise<void> {
  const ground = copyrightGroundApplicability(applicability)
  if (ground.scope === 'global') return
  await query(sql`/* insertCopyrightRestrictionCountries */
    INSERT INTO copyright_restriction_countries (copyright_restriction_id, country_code)
    SELECT ${restrictionId}, country_code FROM unnest(${[...ground.countryCodes]}::text[]) AS country_code
  `)
}

function copyrightDeliveryCountryCode(code: string): CopyrightDeliveryCountryCode {
  const normalized = code.trim().toUpperCase()
  assert(
    /^[A-Z]{2}$/.test(normalized),
    422,
    'Copyright delivery country must be an ISO alpha-2 code',
  )
  return normalized as CopyrightDeliveryCountryCode
}
