import type { AuthoritativeStripeMembershipSnapshot } from '../membership-provider-facts/snapshot.mts'

export type AcceptedStripeMembershipObservation = Pick<
  AuthoritativeStripeMembershipSnapshot,
  'autoRenews' | 'effectiveAt'
>
