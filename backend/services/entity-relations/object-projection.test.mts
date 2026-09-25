import { describe, expect, it } from 'vitest'
import { buildEntityRelationObjectData } from './object-projection.mts'

describe('buildEntityRelationObjectData', () => {
  it.each(['community', 'rss_feed', 'topic_alias'] as const)(
    'refuses %s objects, which have no public projection',
    objectType => {
      expect(() => buildEntityRelationObjectData(objectType)).toThrow(
        `Entity relation reads do not project ${objectType} objects`,
      )
    },
  )
})
