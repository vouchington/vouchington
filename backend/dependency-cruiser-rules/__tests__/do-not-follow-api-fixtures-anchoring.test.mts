import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface DependencyCruiserConfig {
  options: { doNotFollow: { path: string } }
}

// `doNotFollow.path` is a single alternation string, not a data structure -- these tests exercise
// the real compiled regex directly (not a hand-duplicated copy of it) so a future edit that
// re-introduces an unanchored alternative fails here instead of leaving `dep-cruise:backend`
// silently green (the api-fixtures tree has no file matching `.mock.mts`, `__tests__`, or
// `__fixtures__` today, so the normal cruise cannot catch a regression in those three branches;
// see #9317).
const config = require('../../.dependency-cruiser.cjs') as DependencyCruiserConfig
const doNotFollowPath = new RegExp(config.options.doNotFollow.path)

describe('backend/.dependency-cruiser.cjs doNotFollow.path api-fixtures/ anchoring', () => {
  describe.each([
    {
      alternative: '.mock.mts',
      excludedOutsideApiFixtures: 'backend/services/foo/foo.mock.mts',
      followedInsideApiFixtures: 'backend/test-helpers/api-fixtures/foo.mock.mts',
    },
    {
      alternative: '__tests__',
      excludedOutsideApiFixtures: 'backend/services/foo/__tests__/bar.mts',
      followedInsideApiFixtures: 'backend/test-helpers/api-fixtures/__tests__/bar.mts',
    },
    {
      alternative: '__fixtures__',
      excludedOutsideApiFixtures: 'backend/services/foo/__fixtures__/bar.mts',
      followedInsideApiFixtures: 'backend/test-helpers/api-fixtures/__fixtures__/bar.mts',
    },
    {
      alternative: 'build',
      excludedOutsideApiFixtures: 'backend/services/rss-xml/xml-builder.mts',
      followedInsideApiFixtures:
        'backend/test-helpers/api-fixtures/openapi/build-openapi-document.mts',
    },
    {
      alternative: 'fixtures',
      excludedOutsideApiFixtures: 'backend/services/foo/fixtures/bar.mts',
      followedInsideApiFixtures: 'backend/test-helpers/api-fixtures/new-fixtures.mts',
    },
  ])(
    'the $alternative alternative',
    ({ excludedOutsideApiFixtures, followedInsideApiFixtures }) => {
      it('still excludes a matching path outside api-fixtures/ (negative fixture)', () => {
        expect(doNotFollowPath.test(excludedOutsideApiFixtures)).toBe(true)
      })

      it('no longer excludes a matching path under api-fixtures/ (positive fixture)', () => {
        expect(doNotFollowPath.test(followedInsideApiFixtures)).toBe(false)
      })
    },
  )
})
