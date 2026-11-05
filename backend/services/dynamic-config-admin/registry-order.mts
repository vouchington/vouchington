export function orderDynamicConfigRegistryEntries<Entry extends { namespace: string }>(
  entries: readonly Entry[],
  registryOrder: readonly string[],
): Entry[] {
  const orderedNamespaces = new Set(registryOrder)
  const omittedNamespaces: string[] = []

  for (const entry of entries) {
    if (!orderedNamespaces.has(entry.namespace)) omittedNamespaces.push(entry.namespace)
  }

  if (omittedNamespaces.length > 0) {
    throw new Error(
      `Dynamic config registry entries missing from REGISTRY_ORDER: ${omittedNamespaces.join(', ')}`,
    )
  }

  const entriesByNamespace = new Map(entries.map(entry => [entry.namespace, entry]))
  return registryOrder.map(namespace => {
    const entry = entriesByNamespace.get(namespace)
    if (!entry) throw new Error(`Missing dynamic config registry entry for ${namespace}`)
    return entry
  })
}
