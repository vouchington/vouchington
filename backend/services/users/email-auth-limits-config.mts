import { DynamicConfig } from '@data-stores/valkey'

export const EMAIL_CODE_REQUEST_MIN_INTERVAL_DEFAULT_SECONDS = 60
export const EMAIL_CODE_REQUEST_MIN_INTERVAL_MAX_SECONDS = 3600

export const emailAuthLimitsConfig = new DynamicConfig({
  key: 'email-auth-limits-config',
  fieldTypes: { code_request_min_interval_seconds: 'number' },
  defaultFields: {
    code_request_min_interval_seconds: EMAIL_CODE_REQUEST_MIN_INTERVAL_DEFAULT_SECONDS,
  },
})

/** Minimum seconds between email code requests for one email (login) or session (re-auth). Zero disables. */
export function getEmailCodeRequestMinIntervalSeconds(): number {
  const value: unknown = emailAuthLimitsConfig.fields.get('code_request_min_interval_seconds')
  if (value === undefined) return EMAIL_CODE_REQUEST_MIN_INTERVAL_DEFAULT_SECONDS
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return EMAIL_CODE_REQUEST_MIN_INTERVAL_DEFAULT_SECONDS
  }
  return value >= 0 && value <= EMAIL_CODE_REQUEST_MIN_INTERVAL_MAX_SECONDS
    ? value
    : EMAIL_CODE_REQUEST_MIN_INTERVAL_DEFAULT_SECONDS
}
