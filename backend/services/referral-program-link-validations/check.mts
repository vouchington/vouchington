import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isHttpUrlWithoutFragment, normalizeUrlForUrlTable } from '@modules/utils/urls'
import { matchDomain, matchesPathnamePattern } from '@ts-shared/utils/urls'
import { validateUUID } from '@modules/utils'

type ReferralLinkValidationResult = {
  is_valid: boolean
  topic_id: string | null
  referral_program_id: string | null
  user_error_text: string | null
}

interface ValidationRule {
  referral_program_id: string
  hostname: string
  pathname: string
  is_referral_link_url: boolean
  is_invalid_referral_link_url: boolean
  user_error_text: string | null
}

type ReferralLinkValidationOptions = QueryOptions & {
  referral_program_id?: string
}

export async function isUrlReferralLink(
  url: string,
  options?: ReferralLinkValidationOptions,
): Promise<ReferralLinkValidationResult> {
  if (!isHttpUrlWithoutFragment(url)) {
    const userErrorText = url.includes('#')
      ? 'URL fragments are not supported'
      : 'Invalid URL or URL must use HTTPS'
    return {
      is_valid: false,
      topic_id: null,
      referral_program_id: null,
      user_error_text: userErrorText,
    }
  }

  let parsedUrl: URL
  try {
    parsedUrl = normalizeUrlForUrlTable(url)
  } catch {
    return {
      is_valid: false,
      topic_id: null,
      referral_program_id: null,
      user_error_text: 'Invalid URL or URL must use HTTPS',
    }
  }

  const hostname = parsedUrl.hostname
  const pathname = parsedUrl.pathname
  const referralProgramId = options?.referral_program_id ?? null
  if (referralProgramId) {
    validateUUID(referralProgramId)
  }

  const { referral_program_id: _, ...queryOptions } = options ?? {}

  const query = sql`/* isUrlReferralLink */
    SELECT
      rp.topic_id AS referral_program_id,
      rpvr.hostname,
      rpvr.pathname,
      rpvr.is_referral_link_url,
      rpvr.is_invalid_referral_link_url,
      rpvr.user_error_text
    FROM topics__referral_programs rp
    JOIN topics__referral_program_link_validations trplv
      ON trplv.referral_program_id = rp.topic_id
    JOIN referral_program_link_validations rpv
      ON rpv.id = trplv.referral_program_link_validation_id
    JOIN referral_program_link_validations_rules rpvr
      ON rpvr.referral_program_link_validation_id = rpv.id
    WHERE rp.enabled_at IS NOT NULL
      AND rp.disabled_at IS NULL
  `

  if (referralProgramId) {
    query.append(sql` AND rp.topic_id = ${referralProgramId}`)
  }

  query.append(sql`
    ORDER BY
      CASE WHEN rpvr.hostname NOT LIKE '*.%' THEN 0 ELSE 1 END,
      LENGTH(rpvr.hostname) DESC,
      LENGTH(rpvr.pathname) DESC,
      rp.topic_id ASC
  `)

  const { rows } = await read(query, queryOptions)

  for (const rule of rows as ValidationRule[]) {
    if (!matchDomain(hostname, rule.hostname)) {
      continue
    }

    if (!matchesPathnamePattern(pathname, rule.pathname)) {
      continue
    }

    if (!rule.is_referral_link_url) {
      return {
        is_valid: false,
        topic_id: null,
        referral_program_id: null,
        user_error_text: rule.user_error_text,
      }
    }

    if (rule.is_invalid_referral_link_url) {
      return {
        is_valid: false,
        topic_id: rule.referral_program_id,
        referral_program_id: rule.referral_program_id,
        user_error_text: rule.user_error_text,
      }
    }

    return {
      is_valid: true,
      topic_id: rule.referral_program_id,
      referral_program_id: rule.referral_program_id,
      user_error_text: null,
    }
  }

  return {
    is_valid: false,
    topic_id: null,
    referral_program_id: null,
    user_error_text: null,
  }
}
