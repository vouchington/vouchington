import type { Application } from '@jongleberry/api-server'

// Under `isolate: false` the shared app keeps routes that earlier test files in the same fork add,
// some at import time before the production route modules load. The API test server loads those
// modules through `loadProductionRoutes`, which records exactly the routes that load adds, so the
// route-authentication sweep reads only production routes.

type RouteEntry = { method: string; path: string }

const SNAPSHOTS = new WeakMap<Application, readonly string[]>()

function routeTable(app: Application): RouteEntry[] {
  // The router is private to the api-server package and exposes its table as `routes`.
  const router: unknown = Reflect.get(app, 'router')
  const table: unknown = router && Reflect.get(router as object, 'routes')
  if (!Array.isArray(table)) throw new Error('The API router no longer exposes its route table')
  return table as RouteEntry[]
}

/** Runs `load` once per app and records the routes it registers as the production routes. */
export async function loadProductionRoutes(
  app: Application,
  load: () => Promise<unknown>,
): Promise<void> {
  if (SNAPSHOTS.has(app)) return
  const existing = new Set(routeTable(app))
  await load()
  const routes = new Set<string>()
  for (const entry of routeTable(app)) {
    if (!existing.has(entry)) routes.add(`${entry.method} ${entry.path}`)
  }
  if (routes.size === 0) throw new Error('Loading the API routes registered no production routes')
  SNAPSHOTS.set(app, [...routes].toSorted())
}

/** The `METHOD path` routes the production route modules registered on the app. */
export function listProductionRoutes(app: Application): readonly string[] {
  const routes = SNAPSHOTS.get(app)
  if (!routes) throw new Error('Production routes were not recorded; import the API test server')
  return routes
}
