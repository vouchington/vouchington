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

/** Loads one ordered rule snapshot for an ordered batch of URL checks. */
export async function validateReferralLinkUrls(
  urls: string[],
  options: { referralProgramIds?: readonly string[] } = {},
): Promise<ReferralLinkValidationResult[]> {
  if (urls.length === 0) return []
  for (const id of new Set(options.referralProgramIds ?? [])) validateUUID(id)
  const rules = await loadEnabledReferralLinkRules()
  return urls.map((url, index) => {
    const parsed = parseReferralLinkUrl(url)
    const expected = options.referralProgramIds?.[index]
    const matchingRules = expected
      ? rules.filter(rule => rule.referral_program_id === expected)
      : rules
    return parsed instanceof URL ? matchReferralLinkRules(parsed, matchingRules) : parsed
  })
}

export async function isUrlReferralLink(
  url: string,
  options?: ReferralLinkValidationOptions,
): Promise<ReferralLinkValidationResult> {
  const parsed = parseReferralLinkUrl(url)
  if (!(parsed instanceof URL)) return parsed
  const referralProgramId = options?.referral_program_id ?? null
  if (referralProgramId) validateUUID(referralProgramId)
  const rules = await loadEnabledReferralLinkRules(options)
  return matchReferralLinkRules(parsed, rules)
}

function parseReferralLinkUrl(url: string): URL | ReferralLinkValidationResult {
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

  try {
    return normalizeUrlForUrlTable(url)
  } catch {
    return {
      is_valid: false,
      topic_id: null,
      referral_program_id: null,
      user_error_text: 'Invalid URL or URL must use HTTPS',
    }
  }
}

function matchReferralLinkRules(
  parsedUrl: URL,
  rules: ValidationRule[],
): ReferralLinkValidationResult {
  const hostname = parsedUrl.hostname
  const pathname = parsedUrl.pathname
  for (const rule of rules) {
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

async function loadEnabledReferralLinkRules(
  options?: ReferralLinkValidationOptions,
): Promise<ValidationRule[]> {
  const referralProgramId = options?.referral_program_id ?? null
  const { referral_program_id: _, ...queryOptions } = options ?? {}

  const query = sql`/* isUrlReferralLink */
    SELECT
      rp.topic_id AS referral_program_id,
      rpvr.hostname,
      rpvr.pathname,
      rpvr.is_referral_link_url,
      rpvr.is_invalid_referral_link_url,
      rpvr.user_error_text
    FROM referral_program_topics rp
    JOIN referral_program_topic_link_validation_rule_sets trplv
      ON trplv.referral_program_topic_id = rp.topic_id
    JOIN referral_program_link_validation_rule_sets rpv
      ON rpv.id = trplv.referral_program_link_validation_rule_set_id
    JOIN referral_program_link_validation_rules rpvr
      ON rpvr.referral_program_link_validation_rule_set_id = rpv.id
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

  const { rows } = await read<ValidationRule>(query, queryOptions)
  return rows
}
