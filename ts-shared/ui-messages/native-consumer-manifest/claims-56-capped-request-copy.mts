import type { NativeConsumerManifestEntry } from './types.mts'

/**
 * Cap and capped-count copy for vouchington-clients#741, #737 and #683: post image limits, the
 * moderation exposure count with its N+ form, and email, passkey, membership-grant and refund caps.
 * Adoption is pending.
 */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_56_CAPPED_REQUEST_COPY = [
  'native.moderation.exposureReviewedCount',
  'native.moderation.exposureReviewedCountCapped',
  'settings.emailLimit',
  'settings.passkeyLimit',
  'shared.membershipGrantLimit',
  'shared.membershipRefundLimit',
  'shared.postImageLimit',
  'shared.postImageLimitMax',
].map(key => ({
  key,
  consumers: ['dotnet', 'swift'],
  pending: true,
})) as readonly NativeConsumerManifestEntry[]
