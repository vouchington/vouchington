import { loadRegisteredRouteCatalog } from '../api-fixtures/backend-contract-catalog.mts'

export type Route = Pick<
  ReturnType<typeof loadRegisteredRouteCatalog>[number],
  'method' | 'routeTemplate' | 'source'
>

export function routeKey(route: Pick<Route, 'method' | 'routeTemplate'>): string {
  return `${route.method}:${route.routeTemplate}`
}

export function discoverThirdPartyRoutes(): Route[] {
  return loadRegisteredRouteCatalog().map(route => ({
    method: route.method,
    routeTemplate: route.routeTemplate,
    source: route.source,
  }))
}
