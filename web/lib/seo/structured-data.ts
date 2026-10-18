import {
  createCollectionPageJsonLd,
  createComparisonPageJsonLd,
  createItemListJsonLd,
  createOrganizationJsonLd,
  createSiteNavigationJsonLd,
  createWebPageJsonLd,
  createWebSiteJsonLd,
  type ItemListInput,
} from '@vouchington/utils/json-ld'
import { buildAbsoluteUrl, SITE_NAME } from './constants'

export type StructuredDataValue = Record<string, unknown>

const site = { siteName: SITE_NAME, absoluteUrl: buildAbsoluteUrl }

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
  return createOrganizationJsonLd(site, '/icon.svg')
}

export function createWebSiteSchema(): StructuredDataValue {
  return createWebSiteJsonLd(site)
}

export function createSiteNavigationSchema(items: SiteNavigationItem[]): StructuredDataValue {
  return createSiteNavigationJsonLd(site, items)
}

export function createCollectionPageSchema(options: CollectionPageOptions): StructuredDataValue {
  return createCollectionPageJsonLd(site, options)
}

/** Topic type selection remains a product schema decision. */
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

export function createCommunityPageSchema(
  options: CommunityPageSchemaOptions,
): StructuredDataValue {
  return createWebPageJsonLd(site, options)
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
  return createComparisonPageJsonLd(site, { a: topicA, b: topicB, path })
}

export function createItemListSchema(
  items: ItemListInput[],
  listName: string,
): StructuredDataValue {
  return createItemListJsonLd(site, items, listName)
}

export {
  createBreadcrumbSchema,
  resolveBreadcrumbName,
  type BreadcrumbNavItem,
} from './structured-data-breadcrumbs'
