import { checkTopicTypes, checkPostTypes } from './finite-enum-ripple-types.mts'
// oxlint-disable max-lines -- enum ripple guard keeps related cross-surface checks together.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import type {
  FiniteEnumFiles,
  ReadTrackedFile,
  RoutedPage,
} from './finite-enum-ripple-post-types.mts'

const CHECKLIST = 'docs/development/finite-enum-ripple-checklist.md'
const NON_TOPIC_ENTITY_ROUTE_SLUGS = new Set(['domain', 'url'])
const NON_TOPIC_COLLECTION_ROUTE_SLUGS = new Set(['domains', 'urls', 'web-search'])
const NON_POST_COLLECTION_ROUTE_SLUGS = new Set(['test-markdown-html'])

export function checkFiniteEnumRippleGuard(
  ctx: SharedContext,
  errors: string[],
  existingTrackedFiles = ctx.trackedFiles.filter(file => existsSync(join(ctx.repoRoot, file))),
): void {
  const files = collectFiniteEnumFiles(existingTrackedFiles)
  const readTracked = createTrackedFileReader(ctx)
  checkTopicTypes(errors, files, readTracked)
  checkPostTypes(errors, files, readTracked)
}

/** Classifies the already-existing tracked inventory once for every enum ripple check. */
export function collectFiniteEnumFiles(existingTrackedFiles: readonly string[]): FiniteEnumFiles {
  const files: FiniteEnumFiles = {
    existingFileSet: new Set(existingTrackedFiles),
    postCollectionPages: [],
    postCreatePages: [],
    postDetailPages: [],
    topicCollectionPages: [],
    topicComponentFiles: [],
    topicDetailPages: [],
  }
  for (const file of existingTrackedFiles) {
    const topicDetail = /^web\/app\/\(topics\)\/([^/]+)\/\[id\]\/(?:(.*)\/)?page\.tsx?$/.exec(file)
    if (topicDetail && !NON_TOPIC_ENTITY_ROUTE_SLUGS.has(topicDetail[1])) {
      files.topicDetailPages.push({
        file,
        isTopLevel: !topicDetail[2],
        slug: topicDetail[1],
      })
      continue
    }
    const postDetail = /^web\/app\/\(posts\)\/([^/]+)\/\[id\]\/(?:(.*)\/)?page\.tsx?$/.exec(file)
    if (postDetail) {
      files.postDetailPages.push({ file, isTopLevel: !postDetail[2], slug: postDetail[1] })
      continue
    }
    const postCreate = /^web\/app\/\(posts\)\/([^/]+)\/create\/page\.tsx?$/.exec(file)
    if (postCreate) files.postCreatePages.push({ file, isTopLevel: false, slug: postCreate[1] })

    const topicCollection = collectionSlug(file, 'topics')
    if (topicCollection && !NON_TOPIC_COLLECTION_ROUTE_SLUGS.has(topicCollection.slug)) {
      files.topicCollectionPages.push({ file, ...topicCollection })
    }
    const postCollection = collectionSlug(file, 'posts')
    if (postCollection && !NON_POST_COLLECTION_ROUTE_SLUGS.has(postCollection.slug)) {
      files.postCollectionPages.push({ file, ...postCollection })
    }
    if (/^web\/components\/[^/]+\/.*\.[cm]?[tj]sx?$/.test(file)) {
      files.topicComponentFiles.push(file)
    }
  }
  return files
}

export function hasAllFiles(files: FiniteEnumFiles, paths: readonly string[]): boolean {
  return paths.every(file => files.existingFileSet.has(file))
}

export function createTrackedFileReader(ctx: SharedContext): ReadTrackedFile {
  const contents = new Map<string, string>()
  return file => {
    const cached = contents.get(file)
    if (cached !== undefined) return cached
    const content = ctx.readTrackedFile?.(file) ?? readFileSync(join(ctx.repoRoot, file), 'utf8')
    contents.set(file, content)
    return content
  }
}

export function collectionSlug(
  file: string,
  group: 'posts' | 'topics',
): Omit<RoutedPage, 'file'> | undefined {
  const prefix = `web/app/(${group})/`
  if (!file.startsWith(prefix) || !/\/page\.tsx?$/.test(file)) return undefined
  const rest = file.slice(prefix.length)
  const parts = rest.split('/')
  if (parts.length < 2 || parts[1] === '[id]') return undefined
  return { isTopLevel: parts.length === 2, slug: parts[0] }
}

export function checkPostCreatePageTypes(
  errors: string[],
  routeConfigs: { pluralPath: string; postTypes: string[] }[],
  pages: readonly RoutedPage[],
  readTracked: ReadTrackedFile,
): void {
  const typeByPluralPath = new Map(
    routeConfigs.flatMap(config =>
      config.postTypes.length === 1 ? [[config.pluralPath, config.postTypes[0]] as const] : [],
    ),
  )
  for (const page of pages) {
    const expectedType = typeByPluralPath.get(page.slug)
    if (!expectedType) continue
    const content = readTracked(page.file)
    for (const actualType of collectPostCreateTypeLiterals(content)) {
      if (actualType === expectedType) continue
      errors.push(
        finiteEnumError(
          page.file,
          `post create page literal uses "${actualType}" but ${page.slug} expects "${expectedType}"`,
        ),
      )
    }
  }
}

export function collectPostCreateTypeLiterals(content: string): string[] {
  return [
    ...content.matchAll(/\bpostType\s*=\s*['"]([^'"]+)['"]/g),
    ...content.matchAll(/\baction\s*:\s*['"]([^'"]+)['"]/g),
  ].map(item => item[1])
}

export function checkCollectionPagePathLiterals(
  pages: readonly RoutedPage[],
  errors: string[],
  group: 'posts' | 'topics',
  routeSlugs: ReadonlySet<string>,
  readTracked: ReadTrackedFile,
): void {
  for (const page of pages) {
    if (!routeSlugs.has(page.slug)) continue
    const content = readTracked(page.file)
    for (const literalPath of [...content.matchAll(/\bpath:\s*['"]\/([^'"]*)['"]/g)].map(
      item => item[1],
    )) {
      if (!literalPath || literalPath === page.slug || literalPath.startsWith(`${page.slug}/`))
        continue
      errors.push(
        finiteEnumError(
          page.file,
          `${group} collection path literal "/${literalPath}" does not match route directory "${page.slug}"`,
        ),
      )
    }
  }
}

export function checkTopicCollectionComponentPathLiterals(
  errors: string[],
  routeConfigs: { pluralPath: string; singularPath: string }[],
  componentFiles: readonly string[],
  readTracked: ReadTrackedFile,
): void {
  const configByPluralPath = new Map(routeConfigs.map(config => [config.pluralPath, config]))
  for (const file of componentFiles) {
    const match = /^web\/components\/([^/]+)\/.*\.[cm]?[tj]sx?$/.exec(file)
    const config = match ? configByPluralPath.get(match[1]) : undefined
    if (!config) continue
    const content = readTracked(file)
    for (const literalPath of collectNavigationPathLiterals(content)) {
      const firstSegment = literalPath.split('/')[0]
      if (firstSegment === config.pluralPath || firstSegment === config.singularPath) continue
      errors.push(
        finiteEnumError(
          file,
          `topic component navigation path "/${literalPath}" does not match route config "${config.singularPath}" or "${config.pluralPath}"`,
        ),
      )
    }
  }
}

export function collectNavigationPathLiterals(content: string): string[] {
  const paths: string[] = []
  for (const match of content.matchAll(/\b(?:push|replace|redirect)\(\s*['"`]\/([^'"`$)}]+)/g)) {
    const literalPath = match[1]
    if (literalPath && literalPath !== 'login') paths.push(literalPath)
  }
  return paths
}

export function compareSets(
  errors: string[],
  options: {
    label: string
    actualLabel: string
    actualValues: readonly string[]
    expectedLabel: string
    expectedValues: readonly string[]
  },
): void {
  for (const duplicate of duplicateValues(options.actualValues)) {
    errors.push(
      finiteEnumError(
        options.actualLabel,
        `${options.label} duplicate in actual values: ${duplicate}`,
      ),
    )
  }
  for (const duplicate of duplicateValues(options.expectedValues)) {
    errors.push(
      finiteEnumError(
        options.expectedLabel,
        `${options.label} duplicate in expected values: ${duplicate}`,
      ),
    )
  }

  const actual = uniqueSorted(options.actualValues)
  const expected = uniqueSorted(options.expectedValues)
  const missing = expected.filter(value => !actual.includes(value))
  const extra = actual.filter(value => !expected.includes(value))
  if (missing.length === 0 && extra.length === 0) return

  const parts = [
    `${options.label} mismatch`,
    missing.length > 0 ? `missing from ${options.actualLabel}: ${missing.join(', ')}` : '',
    extra.length > 0 ? `stale in ${options.actualLabel}: ${extra.join(', ')}` : '',
    `expected from ${options.expectedLabel}: ${expected.join(', ')}`,
  ].filter(Boolean)
  errors.push(finiteEnumError(options.actualLabel, parts.join('; ')))
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted()
}

export function routePageSlugs(pages: readonly RoutedPage[], topOnly = false): string[] {
  const slugs = new Set<string>()
  for (const page of pages) {
    if (!topOnly || page.isTopLevel) slugs.add(page.slug)
  }
  return [...slugs].toSorted()
}

export function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].toSorted()
}

export function finiteEnumError(file: string, message: string): string {
  return `::error file=${file}::${file}: ${message}. Follow ${CHECKLIST}.`
}

export { checkTopicTypes, checkPostTypes }
