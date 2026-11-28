import type { Application } from '@jongleberry/api-server'

// Under `isolate: false` the shared app keeps routes that earlier test files in the same fork add,
// and route modules that a test file imports directly stay cached. A setup file that runs before
// any test file loads the production route modules through `loadProductionRoutes`, which records
// exactly the routes that load adds. The route-authentication sweep reads only that snapshot.
// Setup files rerun for every test file, so the snapshot lives on `globalThis`.

type RouteEntry = { method: string; path: string }

const PRODUCTION_ROUTES_KEY = '__vouchaProductionRoutes'

type ProductionRoutesGlobal = typeof globalThis & {
  [PRODUCTION_ROUTES_KEY]?: readonly string[]
}

function routeTable(app: Application): RouteEntry[] {
  // The router is private to the api-server package and exposes its table as `routes`.
  const router: unknown = Reflect.get(app, 'router')
  const table: unknown = router && Reflect.get(router as object, 'routes')
  if (!Array.isArray(table)) throw new Error('The API router no longer exposes its route table')
  return table as RouteEntry[]
}

/** Runs `load` on the first call in the process and records the routes it registers. */
export async function loadProductionRoutes(
  app: Application,
  load: () => Promise<unknown>,
): Promise<void> {
  const state = globalThis as ProductionRoutesGlobal
  if (state[PRODUCTION_ROUTES_KEY]) return
  const existing = new Set(routeTable(app))
  await load()
  const routes = new Set<string>()
  for (const entry of routeTable(app)) {
    if (!existing.has(entry)) routes.add(`${entry.method} ${entry.path}`)
  }
  if (routes.size === 0) throw new Error('Loading the API routes registered no production routes')
  state[PRODUCTION_ROUTES_KEY] = [...routes].toSorted()
}

/** The `METHOD path` routes the production route modules registered on the app. */
export function listProductionRoutes(): readonly string[] {
  const routes = (globalThis as ProductionRoutesGlobal)[PRODUCTION_ROUTES_KEY]
  if (!routes) {
    throw new Error('Production routes were not recorded by the production-routes setup file')
  }
  return routes
}
