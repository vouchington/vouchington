import { describe, expect, it } from 'vitest'

import {
  buildRemovalVocabulary,
  parseChangedPackageJsonPaths,
  parseRemovedSurfaces,
  type RemovedSurface,
} from '../removed-surfaces.mts'

const DELETED_FILE_DIFF = `diff --git a/backend/modules/aws/sns-verification.mts b/backend/modules/aws/sns-verification.mts
deleted file mode 100644
index 267e9b35680..00000000000
--- a/backend/modules/aws/sns-verification.mts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function verifySnsSignature() {
-  return true
-}
`

const DELETED_ROUTE_DIFF = `diff --git a/web/app/(marketing)/pricing/page.tsx b/web/app/(marketing)/pricing/page.tsx
deleted file mode 100644
diff --git a/web/app/page.tsx b/web/app/page.tsx
deleted file mode 100644
diff --git a/web/app/old/page.tsx b/web/app/new/page.tsx
similarity index 100%
rename from web/app/old/page.tsx
rename to web/app/new/page.tsx
`

const REMOVED_EXPORT_DIFF = `diff --git a/backend/modules/aws/index.mts b/backend/modules/aws/index.mts
index 32825fef958..4bac6d36b2d 100644
--- a/backend/modules/aws/index.mts
+++ b/backend/modules/aws/index.mts
@@ -1,5 +1,4 @@
 export * from './s3.mts'
 export * from './firehose.mts'
-export * from './sns-verification.mts'
 export * from './cloudwatch.mts'
`

const REORDERED_EXPORT_DIFF = `diff --git a/backend/modules/aws/index.mts b/backend/modules/aws/index.mts
index 32825fef958..4bac6d36b2d 100644
--- a/backend/modules/aws/index.mts
+++ b/backend/modules/aws/index.mts
@@ -1,5 +1,5 @@
 export * from './firehose.mts'
-export * from './cloudwatch.mts'
 export * from './s3.mts'
+export * from './cloudwatch.mts'
`

// A modified (not deleted) package.json — `parseChangedPackageJsonPaths` collects its new-side path
// regardless of what the hunk itself contains; script-removal detection reads the full pre/post
// image separately (`removed-scripts.test.mts`), not this diff.
const PACKAGE_JSON_DIFF = `diff --git a/backend/package.json b/backend/package.json
--- a/backend/package.json
+++ b/backend/package.json
@@ -2,4 +2,3 @@
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
-    "build:ses-lambda": "node build-ses-lambda.mts",
`

// A deleted package.json — already covered by the `deleted-file` surface, so this must be excluded.
const DELETED_PACKAGE_JSON_DIFF = `diff --git a/backend/package.json b/backend/package.json
deleted file mode 100644
index 1111111..0000000
--- a/backend/package.json
+++ /dev/null
@@ -1,3 +0,0 @@
-{
-  "name": "backend"
-}
`

const REMOVED_MULTILINE_NAMED_EXPORT_DIFF = `diff --git a/backend/modules/aws/index.mts b/backend/modules/aws/index.mts
index 32825fef958..4bac6d36b2d 100644
--- a/backend/modules/aws/index.mts
+++ b/backend/modules/aws/index.mts
@@ -1,8 +1,3 @@
 export * from './s3.mts'
-export {
-  verifySnsSignature,
-  parseSnsCertificate,
-} from './sns-verification.mts'
 export * from './cloudwatch.mts'
`

const DELETED_LAYOUT_DIFF = `diff --git a/web/app/(marketing)/layout.tsx b/web/app/(marketing)/layout.tsx
deleted file mode 100644
index 267e9b35680..00000000000
--- a/web/app/(marketing)/layout.tsx
+++ /dev/null
@@ -1,3 +0,0 @@
-export default function MarketingLayout() {
-  return null
-}
`

const DELETED_NESTED_ROUTE_DIFF = `diff --git a/web/app/(dashboard)/settings/billing/page.tsx b/web/app/(dashboard)/settings/billing/page.tsx
deleted file mode 100644
index 267e9b35680..00000000000
--- a/web/app/(dashboard)/settings/billing/page.tsx
+++ /dev/null
@@ -1,3 +0,0 @@
-export default function Billing() {
-  return null
-}
`

const PARTIAL_MULTILINE_EXPORT_REMOVAL_DIFF = `diff --git a/backend/modules/aws/index.mts b/backend/modules/aws/index.mts
index 32825fef958..4bac6d36b2d 100644
--- a/backend/modules/aws/index.mts
+++ b/backend/modules/aws/index.mts
@@ -1,6 +1,5 @@
 export * from './s3.mts'
 export {
-  verifySnsSignature,
   parseSnsCertificate,
 } from './sns-verification.mts'
 export * from './cloudwatch.mts'
`

// Real git output for an empty-file deletion: no hunk or `--- a/`/`+++ /dev/null` pair (verified via `git rm`).
const DELETED_EMPTY_FILE_DIFF = `diff --git a/backend/modules/aws/empty.mts b/backend/modules/aws/empty.mts
deleted file mode 100644
index e69de29..0000000
`

// Real git output for a binary deletion: `Binary files ... differ` replaces `--- a/`/`+++ /dev/null` (verified via `git rm`).
const DELETED_BINARY_FILE_DIFF = `diff --git a/web/public/icon.png b/web/public/icon.png
deleted file mode 100644
index d9d6533..0000000
Binary files a/web/public/icon.png and /dev/null differ
`

const RENAME_DIFF = `diff --git a/backend/modules/aws/old-name.mts b/backend/modules/aws/new-name.mts
similarity index 92%
rename from backend/modules/aws/old-name.mts
rename to backend/modules/aws/new-name.mts
index 267e9b35680..1234567 100644
--- a/backend/modules/aws/old-name.mts
+++ b/backend/modules/aws/new-name.mts
@@ -1,3 +1,3 @@
 export function verify() {
-  return true
+  return false
 }
`

// Pins two fixes: a content-changing rename is no longer skipped, and type-only exports register as removed.
const RENAMED_FILE_REMOVED_TYPE_EXPORT_DIFF = `diff --git a/backend/modules/aws/old.mts b/backend/modules/aws/new.mts
rename from backend/modules/aws/old.mts
rename to backend/modules/aws/new.mts
--- a/backend/modules/aws/old.mts
+++ b/backend/modules/aws/new.mts
@@ -1,3 +1,2 @@
 export * from './s3.mts'
-export type { SnsVerificationResult } from './sns-verification.mts'
 export * from './cloudwatch.mts'
`

describe('parseRemovedSurfaces', () => {
  it('extracts a deleted file', () => {
    expect(parseRemovedSurfaces(DELETED_FILE_DIFF)).toEqual([
      { path: 'backend/modules/aws/sns-verification.mts', type: 'deleted-file' },
    ])
  })

  it('extracts a removed route alongside its deleted file, including the root endpoint and a pure rename', () => {
    expect(parseRemovedSurfaces(DELETED_ROUTE_DIFF)).toEqual([
      { path: 'web/app/(marketing)/pricing/page.tsx', type: 'deleted-file' },
      { path: 'web/app/(marketing)/pricing/page.tsx', route: '/pricing', type: 'removed-route' },
      { path: 'web/app/page.tsx', type: 'deleted-file' },
      { path: 'web/app/page.tsx', route: '/', type: 'removed-route' },
      { path: 'web/app/old/page.tsx', route: '/old', type: 'removed-route' },
    ])
  })

  it('extracts a removed export with no matching addition', () => {
    expect(parseRemovedSurfaces(REMOVED_EXPORT_DIFF)).toEqual([
      { name: 'sns-verification', path: 'backend/modules/aws/index.mts', type: 'removed-export' },
    ])
  })

  it('does not register a reordered export as removed', () => {
    expect(parseRemovedSurfaces(REORDERED_EXPORT_DIFF)).toEqual([])
  })

  it('excludes a rename from registering as a removal', () => {
    expect(parseRemovedSurfaces(RENAME_DIFF)).toEqual([])
  })

  it('extracts a removed type-only export from a renamed file that also drops content', () => {
    expect(parseRemovedSurfaces(RENAMED_FILE_REMOVED_TYPE_EXPORT_DIFF)).toEqual([
      {
        name: 'SnsVerificationResult',
        path: 'backend/modules/aws/new.mts',
        type: 'removed-export',
      },
    ])
  })

  it('extracts every name from a fully removed multiline named-export block', () => {
    expect(parseRemovedSurfaces(REMOVED_MULTILINE_NAMED_EXPORT_DIFF)).toEqual([
      { name: 'verifySnsSignature', path: 'backend/modules/aws/index.mts', type: 'removed-export' },
      {
        name: 'parseSnsCertificate',
        path: 'backend/modules/aws/index.mts',
        type: 'removed-export',
      },
    ])
  })

  it('does not treat a deleted layout.tsx as a removed route', () => {
    expect(parseRemovedSurfaces(DELETED_LAYOUT_DIFF)).toEqual([
      { path: 'web/app/(marketing)/layout.tsx', type: 'deleted-file' },
    ])
  })

  it('extracts a removed member from a retained (unchanged) multiline export block', () => {
    expect(parseRemovedSurfaces(PARTIAL_MULTILINE_EXPORT_REMOVAL_DIFF)).toEqual([
      { name: 'verifySnsSignature', path: 'backend/modules/aws/index.mts', type: 'removed-export' },
    ])
  })

  it('extracts an empty-file deletion with no --- a/ / +++ /dev/null pair', () => {
    expect(parseRemovedSurfaces(DELETED_EMPTY_FILE_DIFF)).toEqual([
      { path: 'backend/modules/aws/empty.mts', type: 'deleted-file' },
    ])
  })

  it('extracts a binary-file deletion with no --- a/ / +++ /dev/null pair', () => {
    expect(parseRemovedSurfaces(DELETED_BINARY_FILE_DIFF)).toEqual([
      { path: 'web/public/icon.png', type: 'deleted-file' },
    ])
  })
})

describe('parseChangedPackageJsonPaths', () => {
  it('collects a modified package.json path', () => {
    expect(parseChangedPackageJsonPaths(PACKAGE_JSON_DIFF)).toEqual(['backend/package.json'])
  })

  it('skips a deleted package.json — the deleted-file surface already covers it', () => {
    expect(parseChangedPackageJsonPaths(DELETED_PACKAGE_JSON_DIFF)).toEqual([])
  })

  it('ignores a changed file that is not a package.json', () => {
    expect(parseChangedPackageJsonPaths(REMOVED_EXPORT_DIFF)).toEqual([])
  })
})

describe('buildRemovalVocabulary', () => {
  it('emits full paths as quoted phrase terms', () => {
    const surfaces = parseRemovedSurfaces(DELETED_FILE_DIFF)
    expect(buildRemovalVocabulary(surfaces).terms).toEqual([
      '"backend/modules/aws/sns-verification.mts"',
    ])
  })

  it('bounds terms at the limit and reports every excluded term as dropped', () => {
    const deletedFiles: RemovedSurface[] = Array.from({ length: 13 }, (_, i) => ({
      path: `backend/modules/removed-surface-${i}.mts`,
      type: 'deleted-file' as const,
    }))
    const surfaces: RemovedSurface[] = [
      ...deletedFiles,
      { name: 'utils', path: 'backend/modules/utils.mts', type: 'removed-export' },
      { name: 'abc', path: 'backend/modules/abc.mts', type: 'removed-export' },
    ]

    const { dropped, terms } = buildRemovalVocabulary(surfaces)

    expect(terms).toHaveLength(12)
    expect(terms).toEqual(deletedFiles.slice(0, 12).map(s => `"${s.path}"`))
    expect(dropped).toEqual([`"backend/modules/removed-surface-12.mts"`, 'utils', 'abc'])
  })

  it('dedupes case-insensitively without reporting the duplicate as dropped', () => {
    const surfaces: RemovedSurface[] = [
      { name: 'replayProtection', path: 'a.mts', type: 'removed-export' },
      { name: 'replayprotection', path: 'b.mts', type: 'removed-export' },
    ]

    const { dropped, terms } = buildRemovalVocabulary(surfaces)

    expect(terms).toEqual(['replayProtection'])
    expect(dropped).toEqual([])
  })

  it('emits a removed nested route as its full quoted path, not just the last segment', () => {
    const surfaces = parseRemovedSurfaces(DELETED_NESTED_ROUTE_DIFF)
    const { terms } = buildRemovalVocabulary(surfaces)
    expect(terms).toContain('"/settings/billing"')
    expect(terms).not.toContain('billing')
  })
})
