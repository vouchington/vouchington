// oxlint-disable max-lines -- enum ripple guard keeps related cross-surface checks together.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import {
  parsePostDetailRouteFactoryArgs,
  parsePostRouteConfigEntries,
  parsePostSlugToType,
  parsePostTypeUnion,
  parseTopicRouteFactoryArgs,
  parseTopicRouteConfigEntries,
  parseTopicTypeEntries,
} from './finite-enum-ripple-parsers.mts'

const CHECKLIST = 'docs/development/finite-enum-ripple-checklist.md'
const INTERNAL_POST_TYPES = new Set(['comment', 'topic_recommendation'])
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

function checkTopicTypes(
  errors: string[],
  files: FiniteEnumFiles,
  readTracked: ReadTrackedFile,
): void {
  const backendTopicsPath = 'backend/types/entities/topic.mts'
  const webTopicsPath = 'web/types/topics.ts'
  const routeConfigsPath = 'web/lib/route-configs.ts'
  if (!hasAllFiles(files, [backendTopicsPath, webTopicsPath])) return

  const backendEntries = parseTopicTypeEntries(readTracked(backendTopicsPath), backendTopicsPath)
  const webEntries = parseTopicTypeEntries(readTracked(webTopicsPath), webTopicsPath)

  const backendSlugByValue = new Map(backendEntries.map(entry => [entry.value, entry.slug]))
  const backendSlugPluralByValue = new Map(
    backendEntries.map(entry => [entry.value, entry.slugPlural]),
  )
  for (const webEntry of webEntries) {
    const backendSlug = backendSlugByValue.get(webEntry.value)
    if (backendSlug && backendSlug !== webEntry.slug) {
      errors.push(
        finiteEnumError(
          webTopicsPath,
          `topicTypes.${webEntry.value}.slug is "${webEntry.slug}" but ${backendTopicsPath} uses "${backendSlug}"`,
        ),
      )
    }
    const backendSlugPlural = backendSlugPluralByValue.get(webEntry.value)
    if (backendSlugPlural && backendSlugPlural !== webEntry.slugPlural) {
      errors.push(
        finiteEnumError(
          webTopicsPath,
          `topicTypes.${webEntry.value}.slugPlural is "${webEntry.slugPlural}" but ${backendTopicsPath} uses "${backendSlugPlural}"`,
        ),
      )
    }
  }

  const topRouteSlugs = routePageSlugs(files.topicDetailPages, true)
  const routeSlugs = routePageSlugs(files.topicDetailPages)
  compareSets(errors, {
    label: 'topic route directories',
    actualLabel: 'web/app/(topics)/*/[id]/page routed files',
    actualValues: topRouteSlugs,
    expectedLabel: `${backendTopicsPath} topicTypes slugs`,
    expectedValues: backendEntries.map(entry => entry.slug),
  })
  compareSets(errors, {
    label: 'topic routed pages',
    actualLabel: 'web/app/(topics)/*/[id] routed files',
    actualValues: routeSlugs,
    expectedLabel: `${backendTopicsPath} topicTypes slugs`,
    expectedValues: backendEntries.map(entry => entry.slug),
  })

  if (hasAllFiles(files, [routeConfigsPath])) {
    const routeConfigContent = readTracked(routeConfigsPath)
    if (routeConfigContent.includes('topicRouteConfigs')) {
      const routeConfigs = parseTopicRouteConfigEntries(routeConfigContent, routeConfigsPath)
      const slugPluralByValue = new Map(
        backendEntries.map(entry => [entry.value, entry.slugPlural]),
      )
      const valueBySlug = new Map(backendEntries.map(entry => [entry.slug, entry.value]))
      const typedRouteConfigs = routeConfigs.map(config => ({
        ...config,
        inferredTopicType: valueBySlug.get(config.singularPath),
      }))
      for (const config of typedRouteConfigs) {
        if (
          config.topicTypes.length > 0 ||
          config.spendingCategory ||
          !config.inferredTopicType ||
          config.key === 'topics'
        ) {
          continue
        }
        errors.push(
          finiteEnumError(
            routeConfigsPath,
            `topicRouteConfigs.${config.key} has singularPath "${config.singularPath}" but does not declare topicTypes`,
          ),
        )
      }
      const enumRouteConfigs = typedRouteConfigs.filter(config => config.topicTypes.length > 0)
      for (const config of routeConfigs) {
        if (config.key === config.pluralPath) continue
        errors.push(
          finiteEnumError(
            routeConfigsPath,
            `topicRouteConfigs.${config.key} has pluralPath "${config.pluralPath}" but the route config key is "${config.key}"`,
          ),
        )
      }
      for (const config of enumRouteConfigs) {
        const topicType = config.topicTypes[0]
        const expectedSlug = topicType ? backendSlugByValue.get(topicType) : undefined
        const expectedSlugPlural = topicType ? slugPluralByValue.get(topicType) : undefined
        if (
          config.topicTypes.length === 1 &&
          config.singularPath === expectedSlug &&
          config.pluralPath === expectedSlugPlural
        ) {
          continue
        }
        errors.push(
          finiteEnumError(
            routeConfigsPath,
            `topicRouteConfigs.${config.key} maps singularPath "${config.singularPath}" and pluralPath "${config.pluralPath}" to [${config.topicTypes.join(', ')}] but topicTypes expects "${expectedSlug ?? 'missing'}" and "${expectedSlugPlural ?? 'missing'}"`,
          ),
        )
      }
      compareSets(errors, {
        label: 'topic route config values',
        actualLabel: `${routeConfigsPath} topicRouteConfigs`,
        actualValues: enumRouteConfigs.flatMap(config => config.topicTypes),
        expectedLabel: backendTopicsPath,
        expectedValues: enumRouteConfigs.flatMap(config =>
          config.topicTypes.filter(value => slugPluralByValue.has(value)),
        ),
      })
      compareSets(errors, {
        label: 'topic collection route config paths',
        actualLabel: `${routeConfigsPath} topicRouteConfigs`,
        actualValues: enumRouteConfigs.map(config => config.pluralPath),
        expectedLabel: `${backendTopicsPath} topicTypes slugPlural`,
        expectedValues: enumRouteConfigs.flatMap(config => {
          const slugPlural = config.topicTypes[0]
            ? slugPluralByValue.get(config.topicTypes[0])
            : undefined
          return slugPlural ? [slugPlural] : []
        }),
      })
      compareSets(errors, {
        label: 'topic top-level collection route directories',
        actualLabel: 'web/app/(topics)/* collection pages',
        actualValues: routePageSlugs(files.topicCollectionPages, true),
        expectedLabel: `${routeConfigsPath} topicRouteConfigs pluralPath`,
        expectedValues: routeConfigs.map(config => config.pluralPath),
      })
      compareSets(errors, {
        label: 'topic collection routed pages',
        actualLabel: 'web/app/(topics)/* collection routed pages',
        actualValues: uniqueSorted(files.topicCollectionPages.map(page => page.slug)),
        expectedLabel: `${routeConfigsPath} topicRouteConfigs pluralPath`,
        expectedValues: routeConfigs.map(config => config.pluralPath),
      })
      checkCollectionPagePathLiterals(
        files.topicCollectionPages,
        errors,
        'topics',
        new Set(routeConfigs.map(config => config.pluralPath)),
        readTracked,
      )
      checkTopicCollectionComponentPathLiterals(
        errors,
        routeConfigs,
        files.topicComponentFiles,
        readTracked,
      )
    }
  }

  for (const page of files.topicDetailPages) {
    for (const args of parseTopicRouteFactoryArgs(readTracked(page.file), page.file)) {
      if (page.slug === args.slug) continue
      errors.push(
        finiteEnumError(
          page.file,
          `topic route factory slug mismatch; route directory is "${page.slug}" but factory uses "${args.slug}"`,
        ),
      )
    }
  }
}

function checkPostTypes(
  errors: string[],
  files: FiniteEnumFiles,
  readTracked: ReadTrackedFile,
): void {
  const postTypesPath = 'backend/types/entities/post.mts'
  const routeConfigsPath = 'web/lib/route-configs.ts'
  if (!hasAllFiles(files, [postTypesPath, routeConfigsPath])) return

  const postTypes = parsePostTypeUnion(readTracked(postTypesPath), postTypesPath)
  const publicPostTypes = postTypes.filter(value => !INTERNAL_POST_TYPES.has(value))
  const routeConfigContent = readTracked(routeConfigsPath)
  const slugToType = parsePostSlugToType(routeConfigContent, routeConfigsPath)
  const topRouteSlugs = routePageSlugs(files.postDetailPages, true)
  const routeSlugs = routePageSlugs(files.postDetailPages)

  compareSets(errors, {
    label: 'public post route config values',
    actualLabel: `${routeConfigsPath} postSlugToType`,
    actualValues: [...slugToType.values()],
    expectedLabel: `${postTypesPath} public PostType values`,
    expectedValues: publicPostTypes,
  })
  compareSets(errors, {
    label: 'public post route directories',
    actualLabel: 'web/app/(posts)/*/[id]/page routed files',
    actualValues: topRouteSlugs,
    expectedLabel: `${routeConfigsPath} postSlugToType slugs`,
    expectedValues: [...slugToType.keys()],
  })
  compareSets(errors, {
    label: 'public post routed pages',
    actualLabel: 'web/app/(posts)/*/[id] routed files',
    actualValues: routeSlugs,
    expectedLabel: `${routeConfigsPath} postSlugToType slugs`,
    expectedValues: [...slugToType.keys()],
  })

  if (routeConfigContent.includes('postRouteConfigs')) {
    const routeConfigs = parsePostRouteConfigEntries(routeConfigContent, routeConfigsPath)
    const typedRouteConfigs = routeConfigs.filter(config => config.postTypes.length > 0)
    for (const config of routeConfigs) {
      if (config.postTypes.length > 0 || config.key === 'posts') continue
      errors.push(
        finiteEnumError(
          routeConfigsPath,
          `postRouteConfigs.${config.key} has singularPath "${config.singularPath}" but does not declare postTypes`,
        ),
      )
    }
    for (const config of routeConfigs) {
      if (config.key === config.pluralPath) continue
      errors.push(
        finiteEnumError(
          routeConfigsPath,
          `postRouteConfigs.${config.key} has pluralPath "${config.pluralPath}" but the route config key is "${config.key}"`,
        ),
      )
    }
    compareSets(errors, {
      label: 'public post collection route config values',
      actualLabel: `${routeConfigsPath} postRouteConfigs`,
      actualValues: typedRouteConfigs.flatMap(config => config.postTypes),
      expectedLabel: `${postTypesPath} public PostType values`,
      expectedValues: publicPostTypes,
    })
    compareSets(errors, {
      label: 'public post collection route config singular paths',
      actualLabel: `${routeConfigsPath} postRouteConfigs`,
      actualValues: typedRouteConfigs.map(config => config.singularPath),
      expectedLabel: `${routeConfigsPath} postSlugToType slugs`,
      expectedValues: [...slugToType.keys()],
    })
    for (const config of typedRouteConfigs) {
      const expectedType = slugToType.get(config.singularPath)
      if (expectedType && config.postTypes.length === 1 && config.postTypes[0] === expectedType) {
        continue
      }
      errors.push(
        finiteEnumError(
          routeConfigsPath,
          `postRouteConfigs.${config.key} maps singularPath "${config.singularPath}" to [${config.postTypes.join(', ')}] but postSlugToType expects "${expectedType ?? 'missing'}"`,
        ),
      )
    }
    compareSets(errors, {
      label: 'public post top-level collection route directories',
      actualLabel: 'web/app/(posts)/* collection pages',
      actualValues: routePageSlugs(files.postCollectionPages, true),
      expectedLabel: `${routeConfigsPath} postRouteConfigs pluralPath`,
      expectedValues: routeConfigs.map(config => config.pluralPath),
    })
    compareSets(errors, {
      label: 'public post collection routed pages',
      actualLabel: 'web/app/(posts)/* collection routed pages',
      actualValues: uniqueSorted(files.postCollectionPages.map(page => page.slug)),
      expectedLabel: `${routeConfigsPath} postRouteConfigs pluralPath`,
      expectedValues: routeConfigs.map(config => config.pluralPath),
    })
    checkPostCreatePageTypes(errors, typedRouteConfigs, files.postCreatePages, readTracked)
    checkCollectionPagePathLiterals(
      files.postCollectionPages,
      errors,
      'posts',
      new Set(typedRouteConfigs.map(config => config.pluralPath)),
      readTracked,
    )
  }

  const detailFactoryArgs = files.postDetailPages.flatMap(page =>
    parsePostDetailRouteFactoryArgs(readTracked(page.file), page.file).map(args => ({
      ...args,
      file: page.file,
      routeSlug: page.slug,
    })),
  )
  compareSets(errors, {
    label: 'public post route factory slugs',
    actualLabel: 'web/app/(posts)/*/[id] route factory calls',
    actualValues: uniqueSorted(detailFactoryArgs.map(args => args.slug)),
    expectedLabel: 'web/app/(posts)/*/[id] routed files',
    expectedValues: routeSlugs,
  })
  compareSets(errors, {
    label: 'public post route factory values',
    actualLabel: 'web/app/(posts)/*/[id] route factory calls',
    actualValues: uniqueSorted(detailFactoryArgs.map(args => args.postType)),
    expectedLabel: `${routeConfigsPath} postSlugToType values`,
    expectedValues: [...slugToType.values()],
  })
  for (const args of detailFactoryArgs) {
    const expectedType = slugToType.get(args.routeSlug)
    if (args.slug === args.routeSlug && expectedType === args.postType) continue
    errors.push(
      finiteEnumError(
        args.file,
        `post route factory args mismatch; route directory is "${args.routeSlug}" and expected type is "${expectedType ?? 'missing'}" but factory uses "${args.postType}", "${args.slug}"`,
      ),
    )
  }
}

type ReadTrackedFile = (file: string) => string

interface RoutedPage {
  file: string
  isTopLevel: boolean
  slug: string
}

interface FiniteEnumFiles {
  existingFileSet: ReadonlySet<string>
  postCollectionPages: RoutedPage[]
  postCreatePages: RoutedPage[]
  postDetailPages: RoutedPage[]
  topicCollectionPages: RoutedPage[]
  topicComponentFiles: string[]
  topicDetailPages: RoutedPage[]
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

function hasAllFiles(files: FiniteEnumFiles, paths: readonly string[]): boolean {
  return paths.every(file => files.existingFileSet.has(file))
}

function createTrackedFileReader(ctx: SharedContext): ReadTrackedFile {
  const contents = new Map<string, string>()
  return file => {
    const cached = contents.get(file)
    if (cached !== undefined) return cached
    const content = ctx.readTrackedFile?.(file) ?? readFileSync(join(ctx.repoRoot, file), 'utf8')
    contents.set(file, content)
    return content
  }
}

function collectionSlug(
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

function checkPostCreatePageTypes(
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

function collectPostCreateTypeLiterals(content: string): string[] {
  return [
    ...content.matchAll(/\bpostType\s*=\s*['"]([^'"]+)['"]/g),
    ...content.matchAll(/\baction\s*:\s*['"]([^'"]+)['"]/g),
  ].map(item => item[1])
}

function checkCollectionPagePathLiterals(
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

function checkTopicCollectionComponentPathLiterals(
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

function collectNavigationPathLiterals(content: string): string[] {
  const paths: string[] = []
  for (const match of content.matchAll(/\b(?:push|replace|redirect)\(\s*['"`]\/([^'"`$)}]+)/g)) {
    const literalPath = match[1]
    if (literalPath && literalPath !== 'login') paths.push(literalPath)
  }
  return paths
}

function compareSets(
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

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].toSorted()
}

function routePageSlugs(pages: readonly RoutedPage[], topOnly = false): string[] {
  const slugs = new Set<string>()
  for (const page of pages) {
    if (!topOnly || page.isTopLevel) slugs.add(page.slug)
  }
  return [...slugs].toSorted()
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].toSorted()
}

function finiteEnumError(file: string, message: string): string {
  return `::error file=${file}::${file}: ${message}. Follow ${CHECKLIST}.`
}
