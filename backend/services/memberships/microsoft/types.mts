import type { MembershipVerificationReasonCode } from '../verification-contract.mts'

export type MicrosoftStoreEnvironment = 'test' | 'production'

export type MicrosoftStoreServiceTickets = {
  collections_service_ticket: string
  purchase_service_ticket: string
  publisher_user_id: string
  expires_at: Date
}

export type MicrosoftStoreCollectionItem = {
  id?: string
  recurrenceData?: string
  productId?: string
  skuId?: string
  startDate?: string
  modifiedDate?: string
  endDate?: string
  status?: 'Active' | 'Expired' | 'Revoked' | 'Banned'
}

export type MicrosoftStoreRecurrence = {
  id?: string
  beneficiary?: string
  productId?: string
  skuId?: string
  startTime?: string
  expirationTime?: string
  expirationTimeWithGrace?: string
  lastModified?: string
  cancellationDate?: string
  autoRenew?: boolean
  recurrenceState?: 'None' | 'Active' | 'Inactive' | 'Canceled' | 'InDunning' | 'Failed'
}

export type MicrosoftStoreClient = {
  queryCollections(options: {
    key: string
    publisherUserId: string
    productId: string
    skuId: string | null
    environment: MicrosoftStoreEnvironment
  }): Promise<MicrosoftStoreCollectionItem[]>
  queryRecurrences(options: {
    key: string
    environment: MicrosoftStoreEnvironment
  }): Promise<MicrosoftStoreRecurrence[]>
}

export type MicrosoftStoreObservation = {
  provider: 'microsoft_store'
  environment: MicrosoftStoreEnvironment
  applicationId: string
  membershipProductId: string
  providerProductId: string
  providerLineageId: string
  providerAccountId: null
  collectionItemId: string
  providerRevision: string
  providerOrder: number
  effectiveAt: Date
  expiresAt: Date
  terminalAt: Date | null
  lifecycle: 'active' | 'expired' | 'revoked'
  autoRenews: boolean
}

export type MicrosoftStoreVerificationResult =
  | { accepted: true; observation: MicrosoftStoreObservation }
  | { accepted: false; reasonCode: MembershipVerificationReasonCode }
