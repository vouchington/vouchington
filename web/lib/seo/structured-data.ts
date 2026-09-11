import { buildAbsoluteUrl, SITE_NAME } from './constants'
import { escapeInlineScriptJson } from '@/lib/utils/inline-script-json'

export type StructuredDataValue = Record<string, unknown>

export interface SiteNavigationItem {
  name: string
  path: string
}

interface CollectionPageOptions {
  title: string
  description: string
  path: string
}

interface TopicSchemaOptions {
  name: string
  description?: string
  path: string
  schemaOrgType?: string
}

interface CommunityPageSchemaOptions {
  name: string
  description?: string
  path: string
}

export function createOrganizationSchema(): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: buildAbsoluteUrl('/'),
    logo: buildAbsoluteUrl('/icon.svg'),
  }
}

export function createWebSiteSchema(): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: buildAbsoluteUrl('/'),
  }
}

export function createSiteNavigationSchema(items: SiteNavigationItem[]): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'SiteNavigationElement',
    name: 'Primary navigation',
    hasPart: items.map(item => ({
      '@type': 'WebPage',
      name: item.name,
      url: buildAbsoluteUrl(item.path),
    })),
  }
}

export function createCollectionPageSchema({
  title,
  description,
  path,
}: CollectionPageOptions): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: buildAbsoluteUrl(path),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: buildAbsoluteUrl('/'),
    },
  }
}

export function createTopicSchema({
  name,
  description,
  path,
  schemaOrgType,
}: TopicSchemaOptions): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': schemaOrgType ?? 'Thing',
    name,
    ...(description ? { description } : {}),
    url: buildAbsoluteUrl(path),
  }
}

export function createCommunityPageSchema({
  name,
  description,
  path,
}: CommunityPageSchemaOptions): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    ...(description ? { description } : {}),
    url: buildAbsoluteUrl(path),
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: buildAbsoluteUrl('/'),
    },
  }
}

interface ComparisonPageSchemaOptions {
  topicA: { name: string; path: string; schemaOrgType?: string }
  topicB: { name: string; path: string; schemaOrgType?: string }
  path: string
}

export function createComparisonPageSchema({
  topicA,
  topicB,
  path,
}: ComparisonPageSchemaOptions): StructuredDataValue {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${topicA.name} vs ${topicB.name}`,
    url: buildAbsoluteUrl(path),
    about: [
      {
        '@type': topicA.schemaOrgType ?? 'Thing',
        name: topicA.name,
        url: buildAbsoluteUrl(topicA.path),
      },
      {
        '@type': topicB.schemaOrgType ?? 'Thing',
        name: topicB.name,
        url: buildAbsoluteUrl(topicB.path),
      },
    ],
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: buildAbsoluteUrl('/'),
    },
  }
}

export interface ItemListInput {
  name: string
  url: string
  description?: string
  image?: string
}

export function createItemListSchema(
  items: ItemListInput[],
  listName: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: buildAbsoluteUrl(item.url),
      ...(item.description ? { description: item.description } : {}),
      ...(item.image ? { image: buildAbsoluteUrl(item.image) } : {}),
    })),
  }
}

export function serializeStructuredData(data: StructuredDataValue): string {
  return escapeInlineScriptJson(JSON.stringify(data))
}

export {
  createBreadcrumbSchema,
  resolveBreadcrumbName,
  type BreadcrumbNavItem,
} from './structured-data-breadcrumbs'
