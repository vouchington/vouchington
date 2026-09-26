import {
  checkPostTypes,
  type FiniteEnumFiles,
  type ReadTrackedFile,
} from './finite-enum-ripple-post-types.mts'
import {
  parseTopicRouteConfigEntries,
  parseTopicRouteFactoryArgs,
  parseTopicTypeEntries,
} from './finite-enum-ripple-parsers.mts'
import {
  checkCollectionPagePathLiterals,
  checkTopicCollectionComponentPathLiterals,
  compareSets,
  finiteEnumError,
  hasAllFiles,
  routePageSlugs,
  uniqueSorted,
} from './finite-enum-ripple-guard.mts'

export function checkTopicTypes(
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

export { checkPostTypes }
