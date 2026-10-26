import {
  createOrganizationJsonLd,
  createWebSiteJsonLd,
  createSiteNavigationJsonLd,
  createCollectionPageJsonLd,
  createThingJsonLd,
  createWebPageJsonLd,
  createComparisonPageJsonLd,
  createItemListJsonLd,
  type ItemListInput,
} from '@vouchington/utils/json-ld'
import { buildAbsoluteUrl, SITE_NAME } from './constants'

const site = { absoluteUrl: buildAbsoluteUrl, siteName: SITE_NAME }

interface SiteNavigationItem {
  name: string
  path: string
}

export function createOrganizationSchema() {
  return createOrganizationJsonLd(site, '/icon.svg')
}
export function createWebSiteSchema() {
  return createWebSiteJsonLd(site)
}
export function createSiteNavigationSchema(items: SiteNavigationItem[]) {
  return createSiteNavigationJsonLd(site, items)
}
export function createCollectionPageSchema(
  input: Parameters<typeof createCollectionPageJsonLd>[1],
) {
  return createCollectionPageJsonLd(site, input)
}
export function createTopicSchema(input: Parameters<typeof createThingJsonLd>[1]) {
  return createThingJsonLd(site, input)
}
export function createCommunityPageSchema(input: Parameters<typeof createWebPageJsonLd>[1]) {
  return createWebPageJsonLd(site, input)
}
export function createComparisonPageSchema({
  topicA,
  topicB,
  path,
}: {
  topicA: Parameters<typeof createComparisonPageJsonLd>[1]['a']
  topicB: Parameters<typeof createComparisonPageJsonLd>[1]['b']
  path: string
}) {
  return createComparisonPageJsonLd(site, { a: topicA, b: topicB, path })
}
export function createItemListSchema(items: ItemListInput[], listName: string) {
  return createItemListJsonLd(site, items, listName)
}
