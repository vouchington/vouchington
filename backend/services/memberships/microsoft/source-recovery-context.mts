export type MicrosoftStoreSourceRecoveryContext = {
  sourceId: string
  userId: string
  environment: 'test' | 'production'
  applicationId: string
  publisherUserId: string
  providerProductId: string
  mappingSkuId: string | null
  providerLineageId: string
  encryptedCollectionsKey: Buffer
  collectionsKeyLookupSha256: string
  encryptedPurchaseKey: Buffer
  purchaseKeyLookupSha256: string
}
