import {
  checkCollectionPagePathLiterals,
  checkPostCreatePageTypes,
  compareSets,
  finiteEnumError,
  hasAllFiles,
  routePageSlugs,
  uniqueSorted,
} from './finite-enum-ripple-guard.mts'
import {
  parsePostDetailRouteFactoryArgs,
  parsePostRouteConfigEntries,
  parsePostSlugToType,
  parsePostTypeUnion,
} from './finite-enum-ripple-parsers.mts'

const INTERNAL_POST_TYPES = new Set(['comment', 'topic_recommendation'])

export function checkPostTypes(
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

export type ReadTrackedFile = (file: string) => string

export interface RoutedPage {
  file: string
  isTopLevel: boolean
  slug: string
}

export interface FiniteEnumFiles {
  existingFileSet: ReadonlySet<string>
  postCollectionPages: RoutedPage[]
  postCreatePages: RoutedPage[]
  postDetailPages: RoutedPage[]
  topicCollectionPages: RoutedPage[]
  topicComponentFiles: string[]
  topicDetailPages: RoutedPage[]
}
