import { NATIVE_CONSUMER_MANIFEST_CLAIMS_01 } from './native-consumer-manifest/claims-01.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_02 } from './native-consumer-manifest/claims-02.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_02_INTENTS } from './native-consumer-manifest/claims-02-intents.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_02_MEMBERSHIPS } from './native-consumer-manifest/claims-02-memberships.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_03 } from './native-consumer-manifest/claims-03.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_04 } from './native-consumer-manifest/claims-04.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_05 } from './native-consumer-manifest/claims-05.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_06 } from './native-consumer-manifest/claims-06.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_07 } from './native-consumer-manifest/claims-07.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_08 } from './native-consumer-manifest/claims-08.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_09 } from './native-consumer-manifest/claims-09.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_10 } from './native-consumer-manifest/claims-10.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_10_TOP_HASHTAGS } from './native-consumer-manifest/claims-10-top-hashtags.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_11 } from './native-consumer-manifest/claims-11.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_11_COMMUNITY_ROWS_TAIL } from './native-consumer-manifest/claims-11-community-rows-tail.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_12 } from './native-consumer-manifest/claims-12.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_13 } from './native-consumer-manifest/claims-13.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_14 } from './native-consumer-manifest/claims-14.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_15 } from './native-consumer-manifest/claims-15.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_16 } from './native-consumer-manifest/claims-16.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_17 } from './native-consumer-manifest/claims-17.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_17_MODERATION_SUMMARY } from './native-consumer-manifest/claims-17-moderation-summary.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_18 } from './native-consumer-manifest/claims-18.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_19 } from './native-consumer-manifest/claims-19.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_20 } from './native-consumer-manifest/claims-20.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_21 } from './native-consumer-manifest/claims-21.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_22 } from './native-consumer-manifest/claims-22.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_23 } from './native-consumer-manifest/claims-23.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_24 } from './native-consumer-manifest/claims-24.mts'
import { NATIVE_CONSUMER_MANIFEST_CLAIMS_25 } from './native-consumer-manifest/claims-25.mts'
import type { NativeConsumerManifestEntry } from './native-consumer-manifest/types.mts'

export type {
  NativeConsumer,
  NativeConsumerManifestEntry,
} from './native-consumer-manifest/types.mts'

/** Canonical catalog paths consumed by native clients, assembled from sorted cap-sized claim slices. */
const NATIVE_CONSUMER_MANIFEST_CLAIM_SLICES: readonly (readonly NativeConsumerManifestEntry[])[] = [
  NATIVE_CONSUMER_MANIFEST_CLAIMS_01,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_02_INTENTS,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_02_MEMBERSHIPS,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_02,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_03,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_04,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_05,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_06,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_07,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_08,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_09,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_10,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_10_TOP_HASHTAGS,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_11,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_11_COMMUNITY_ROWS_TAIL,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_12,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_13,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_14,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_15,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_16,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_17_MODERATION_SUMMARY,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_17,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_18,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_19,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_20,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_21,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_22,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_23,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_24,
  NATIVE_CONSUMER_MANIFEST_CLAIMS_25,
]

export const NATIVE_CONSUMER_MANIFEST =
  NATIVE_CONSUMER_MANIFEST_CLAIM_SLICES.flat().toSorted(compareManifestEntries)

function compareManifestEntries(
  left: NativeConsumerManifestEntry,
  right: NativeConsumerManifestEntry,
): number {
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0
}
