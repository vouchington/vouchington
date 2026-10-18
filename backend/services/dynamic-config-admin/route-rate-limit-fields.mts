import { ACTIVITYPUB_INBOX_LIMITS } from '@services/route-rate-limits/config'
import { RATE_LIMIT_MAX_EXEMPTION } from './registry-entry-utils.mts'

export function routeRateLimitFields() {
  return {
    enabled: { description: 'Enable route rate limiting.' },
    anon_read: rateLimitThresholdField('Anonymous read'),
    anon_write: rateLimitThresholdField('Anonymous write'),
    anon_sensitive: rateLimitThresholdField('Anonymous sensitive action'),
    anon_oauth_callback: rateLimitThresholdField('OAuth provider callback'),
    anon_read_ttl: rateLimitTtlField('Anonymous read'),
    anon_write_ttl: rateLimitTtlField('Anonymous write'),
    anon_sensitive_ttl: rateLimitTtlField('Anonymous sensitive action'),
    anon_oauth_callback_ttl: rateLimitTtlField('OAuth provider callback'),
    attested_multiplier: {
      description:
        'Rate limit threshold multiplier applied to attested (Apple App Attest) devices. Default 1 keeps their allowance unchanged.',
      minValue: 1,
      maxValue: 100,
    },
    activitypub_inbox_attempt_max_requests: {
      description: 'ActivityPub inbox attempts per source IP and pre-verification window.',
      minValue: ACTIVITYPUB_INBOX_LIMITS.attemptMaxRequests.min,
      maxValue: ACTIVITYPUB_INBOX_LIMITS.attemptMaxRequests.max,
      integer: true,
    },
    activitypub_inbox_attempt_window_seconds: {
      description: 'ActivityPub inbox source-IP attempt window length in seconds.',
      minValue: ACTIVITYPUB_INBOX_LIMITS.attemptWindowSeconds.min,
      maxValue: ACTIVITYPUB_INBOX_LIMITS.attemptWindowSeconds.max,
      integer: true,
    },
    activitypub_inbox_max_requests: {
      description: 'Accepted ActivityPub inbox deliveries per sender hostname and window.',
      minValue: ACTIVITYPUB_INBOX_LIMITS.maxRequests.min,
      maxValue: ACTIVITYPUB_INBOX_LIMITS.maxRequests.max,
      integer: true,
    },
    activitypub_inbox_window_seconds: {
      description: 'ActivityPub inbox sender rate-limit window length in seconds.',
      minValue: ACTIVITYPUB_INBOX_LIMITS.windowSeconds.min,
      maxValue: ACTIVITYPUB_INBOX_LIMITS.windowSeconds.max,
      integer: true,
    },
  }
}

function rateLimitThresholdField(label: string) {
  return {
    description: `${label} request threshold.`,
    maxValueExemption: RATE_LIMIT_MAX_EXEMPTION,
    minValue: 1,
    integer: true,
  }
}

function rateLimitTtlField(label: string) {
  return {
    description: `${label} rate-limit window length in seconds.`,
    maxValueExemption: RATE_LIMIT_MAX_EXEMPTION,
    minValue: 1,
    integer: true,
  }
}
