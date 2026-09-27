import { nativeTopicTagApiFixtureCases } from './native-topic-tag-cases.mts'
import { nativeEntityRelationReadApiFixtureCases } from './native-entity-relation-read-cases.mts'
import { nativeEntityRelationWriteApiFixtureCases } from './native-entity-relation-write-cases.mts'
import { nativeContentDetailApiFixtureCases } from './native-content-detail-cases.mts'
import { nativeBookmarkApiFixtureCases } from './native-bookmark-cases.mts'
import type { ApiFixtureCase } from './types.mts'

export const nativeTagsBookmarksApiFixtureCases: ApiFixtureCase[] = [
  ...nativeTopicTagApiFixtureCases,
  ...nativeEntityRelationReadApiFixtureCases,
  ...nativeEntityRelationWriteApiFixtureCases,
  ...nativeContentDetailApiFixtureCases,
  ...nativeBookmarkApiFixtureCases,
]
