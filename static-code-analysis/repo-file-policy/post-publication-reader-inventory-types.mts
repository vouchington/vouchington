export const INVENTORY_PATH = 'static-code-analysis/post-publication-reader-inventory.json'
export const CANONICAL_BUILDER =
  'backend/modules/feed-query-builders/post-publication-eligibility.mts'

export type ReaderInventory = {
  version: 1
  canonical_builder: string
  implemented: Array<{
    path: string
    classification:
      | 'direct-boundary'
      | 'direct-sql'
      | 'descendants-boundary'
      | 'mixed-discovery-sql'
      | 'public-boundary'
      | 'public-sql'
      | 'public-view'
      | 'story-posts-boundary'
      | 'viewer-discovery-sql'
  }>
  pr2_baseline: Array<{ path: string; classification: 'public-reader' }>
  classified_exceptions: Array<{
    path: string
    classification:
      | 'mutation'
      | 'private-reader'
      | 'projection-owner'
      | 'raw-hydrator'
      | 'staff-reader'
    reason: string
    owner_path: string
    owner_classification: string
  }>
}
