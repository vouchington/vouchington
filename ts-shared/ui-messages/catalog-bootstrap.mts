import type { Catalog, EnCatalog } from './index.mts'

/** JSON-safe catalog shape used by the server-to-client hydration bootstrap. */
export type SerializableCatalog = Catalog

/**
 * Detaches a resolved catalog into a plain JSON-safe value. Catalog leaves are strings or data
 * descriptors, so no executable reconstruction step is necessary on the client.
 */
export const serializeCatalog = structuredClone<SerializableCatalog>

/** Restores the catalog's compile-time English shape after a JSON round trip. */
export function deserializeCatalog(catalog: SerializableCatalog): EnCatalog {
  return catalog as EnCatalog
}
