import crypto from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'

import { entityRelationMetadatum } from '@services/entity-relations/metadata'

import type { PrivateUser } from '@services/users/types'

// User-subject relations other than tagging belong to /api/v1/bookmarks, and topic_alias has no
// generic surface, so the route rejects those before reading.
const routableTuples = entityRelationMetadatum.filter(
  ({ subject_type, predicate, object_type }) =>
    subject_type !== 'topic_alias' &&
    object_type !== 'topic_alias' &&
    (subject_type !== 'user' || (predicate === 'category' && object_type === 'topic')),
)

describe('entity-relations reads for every routable tuple', () => {
  let viewer: PrivateUser

  beforeAll(async () => {
    viewer = await createTestUser()
  })

  it.each(routableTuples.map(m => [m.subject_type, m.predicate, m.object_type] as const))(
    'lists %s %s %s relations',
    async (subjectType, predicate, objectType) => {
      const subjectId = subjectType === 'user' ? viewer.id : crypto.randomUUID()
      const request = createRequest()
      await request.authenticateAs(viewer)
      const response = await request.get(
        `/api/v1/entity-relations/${subjectType}/${subjectId}/${predicate}/${objectType}`,
      )
      expect(response.status).toBe(200)
    },
  )
})
