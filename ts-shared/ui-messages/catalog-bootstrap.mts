import type { Catalog, EnCatalog } from './index.mts'

/** JSON-safe catalog shape used by the server-to-client hydration bootstrap. */
export type SerializableCatalog = Catalog

/** Restores the catalog's compile-time English shape after a JSON round trip. */
export function deserializeCatalog(catalog: SerializableCatalog): EnCatalog {
  return catalog as EnCatalog
}
