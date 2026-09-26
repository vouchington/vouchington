export type PublicationProjectionIdentity = {
  topicIds: string[]
  identityKeys: Array<{ kind: string; value: string }>
  sitemapTargets: Array<{ postType: string; day: string }>
}
