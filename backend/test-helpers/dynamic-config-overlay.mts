type ApplyFieldsFromMap = (fieldsMap: unknown, skipFieldNames?: Set<string>) => Promise<void>
type RefreshableConfig = { applyFieldsFromMap?: ApplyFieldsFromMap }

const heldNamesByConfig = new WeakMap<object, Set<string[]>>()

/**
 * Keeps `names` out of valkyries' `refresh()` write loop until the returned disposer runs.
 * `refresh()` hands `applyFieldsFromMap` the names it must not overwrite, so adding ours there
 * means a refreshed config never exposes the default between the refresh and a re-apply.
 * The idle hook stays on the test instance and skips nothing; it is an own property on the test instance only; production configs never load this file.
 */
export function holdDynamicConfigFieldsAcrossRefresh(
  config: object,
  names: readonly string[],
): () => void {
  const refreshable = config as RefreshableConfig
  const original = refreshable.applyFieldsFromMap
  if (typeof original !== 'function') return () => {}

  const held = [...names]
  let layers = heldNamesByConfig.get(config)
  if (!layers) {
    layers = new Set()
    heldNamesByConfig.set(config, layers)
    const owned = layers
    refreshable.applyFieldsFromMap = function applyWithoutHeldFields(fieldsMap, skipFieldNames) {
      const skip = new Set(skipFieldNames)
      for (const layer of owned) for (const name of layer) skip.add(name)
      return original.call(config, fieldsMap, skip)
    }
  }
  layers.add(held)

  return function releaseHeldFields(): void {
    layers.delete(held)
  }
}
