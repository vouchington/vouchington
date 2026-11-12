import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_40_REFERRAL_LABELS = [
  {
    key: 'extracted.referralLinks.referralLinkCard.officialVoucha_a2d311b4',
    consumers: ['dotnet'],
  },
  { key: 'extracted.referralLinks.referralLinkList.everyoneElse_919112f4', consumers: ['dotnet'] },
  {
    key: 'extracted.referralLinks.referralLinkList.useOurOfficialLinks_1626a49d',
    consumers: ['dotnet'],
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
