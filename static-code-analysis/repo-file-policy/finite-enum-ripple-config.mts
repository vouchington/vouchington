import type { FiniteEnumRippleConfig } from 'vouchington-tooling/finite-enum-ripple'
import type { FiniteEnumFiles } from './finite-enum-ripple-model.mts'

export function finiteEnumConfiguration(files: FiniteEnumFiles): FiniteEnumRippleConfig {
  return {
    files: {
      existingFileSet: files.existingFileSet,
      unionCollectionPages: files.postCollectionPages,
      unionCreatePages: files.postCreatePages,
      unionDetailPages: files.postDetailPages,
      structuredCollectionPages: files.topicCollectionPages,
      structuredDetailPages: files.topicDetailPages,
      structuredComponentFiles: files.topicComponentFiles.flatMap(file => {
        const slug = file.split('/')[2]
        return files.topicCollectionPages.some(page => page.slug === slug) ? [{ file, slug }] : []
      }),
    },
    diagnosticSuffix: ' Follow docs/development/finite-enum-ripple-checklist.md.',
    structured: {
      backendPath: 'backend/types/entities/topic.mts',
      webPath: 'web/types/topics.ts',
      routeConfigsPath: 'web/lib/route-configs.ts',
      typeObject: 'topicTypes',
      routeConfigObject: 'topicRouteConfigs',
      typeArrayProperty: 'topicTypes',
      pluralPathProperty: 'pluralPath',
      singularPathProperty: 'singularPath',
      routeExemptionProperty: 'spendingCategory',
      slugProperty: 'slug',
      slugPluralProperty: 'slugPlural',
      factoryCallPattern: /^create[A-Za-z]+Page$/,
      routeConfigExceptions: ['topics'],
      // Bank accounts have a detail route but no topic collection route.
      collectionRouteExclusions: ['bank_account'],
      routeLabels: {
        detailTop: 'web/app/(topics)/*/[id]/page routed files',
        detail: 'web/app/(topics)/*/[id] routed files',
        collectionTop: 'web/app/(topics)/* collection pages',
        collection: 'web/app/(topics)/* collection routed pages',
      },
      collectionLabel: 'topic',
      collectionPathLabel: 'topics',
      ignoredNavigationPaths: ['login'],
      collectionPathLiteralPattern: /\bpath:\s*['"]\/([^'"]*)['"]/g,
      navigationPathLiteralPattern: /\b(?:push|replace|redirect)\(\s*['"`]\/([^'"`$)}]+)/g,
    },
    union: {
      typesPath: 'backend/types/entities/post.mts',
      routeConfigsPath: 'web/lib/route-configs.ts',
      typeAlias: 'PostType',
      slugMapObject: 'postSlugToType',
      routeConfigObject: 'postRouteConfigs',
      typeArrayProperty: 'postTypes',
      pluralPathProperty: 'pluralPath',
      singularPathProperty: 'singularPath',
      factoryCallPattern: /^create[A-Za-z]+Page$/,
      internalTypes: ['comment', 'topic_recommendation'],
      routeConfigExceptions: ['posts'],
      routeLabels: {
        detailTop: 'web/app/(posts)/*/[id]/page routed files',
        detail: 'web/app/(posts)/*/[id] routed files',
        collectionTop: 'web/app/(posts)/* collection pages',
        collection: 'web/app/(posts)/* collection routed pages',
        factory: 'web/app/(posts)/*/[id] route factory calls',
      },
      collectionLabel: 'public post',
      collectionPathLabel: 'posts',
      createPageTypeProperties: ['postType', 'action'],
      collectionPathLiteralPattern: /\bpath:\s*['"]\/([^'"]*)['"]/g,
    },
  }
}
