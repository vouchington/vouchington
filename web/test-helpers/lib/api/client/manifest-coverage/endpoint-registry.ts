export type ManifestEndpoint = {
  method: string
  path: string
  query?: Record<string, string>
  requestBody?: unknown
}

export function endpoint(path: string, query?: Record<string, string>): ManifestEndpoint {
  return { method: 'GET', path, query }
}

export function mergeEndpointRegistries(
  ...registries: ReadonlyArray<Readonly<Record<string, ManifestEndpoint>>>
): Readonly<Record<string, ManifestEndpoint>> {
  const merged: Record<string, ManifestEndpoint> = Object.create(null)
  for (const registry of registries) {
    for (const [id, endpoint] of Object.entries(registry)) {
      if (Object.hasOwn(merged, id)) {
        throw new Error(`Duplicate manifest endpoint fixture: ${id}`)
      }
      merged[id] = endpoint
    }
  }
  return Object.freeze(merged)
}
