export type UrlFlagCursor = {
  kind: 'url'
  urlId: string
  upperId?: string
  phase?: 'posts' | 'related' | 'rss' | 'aliases'
  afterId?: string
  parents?: { urlId: string; afterAliasId: string }[]
  afterAliasId?: string
}
export type RepairFlagCursor = {
  kind: 'repair'
  phase?: 'posts' | 'rss'
  afterId?: string
  upperId?: string
}
export type LookupReadmissionCursor = { kind: 'readmission'; afterId?: string; upperId?: string }
export type HackerNewsFlagData = UrlFlagCursor | RepairFlagCursor | LookupReadmissionCursor
