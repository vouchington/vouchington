// Two-level memoizing cache used by keys.mts's getResolvedKeySet: a WeakMap fast path keyed on an
// object's identity (e.g. a Worker/backend binding stable for a process/isolate's lifetime) over a
// Map keyed on a secondary value (e.g. JwtRuntimeMode), falling through to a content-keyed Map for
// callers with no identity key or a fresh identity key whose content already resolved elsewhere.
// `getContentKey` is a thunk, not a precomputed value, so an identity-cache hit skips deriving the
// content key entirely — the whole point is avoiding that derivation's cost on repeat calls.
export class ContentAndIdentityCache<TIdentityKey extends object, TSubKey, TValue> {
  private readonly byContent = new Map<string, TValue>()
  private readonly byIdentity = new WeakMap<TIdentityKey, Map<TSubKey, TValue>>()

  getOrCompute(
    identityKey: TIdentityKey | undefined,
    subKey: TSubKey,
    getContentKey: () => string,
    compute: () => TValue,
  ): TValue {
    const identityMap = identityKey && this.byIdentity.get(identityKey)
    const identityCached = identityMap?.get(subKey)
    if (identityCached !== undefined) {
      return identityCached
    }

    // Bounded-growth assumption: callers pass a fixed, small set of key-material
    // combinations (mode × key-set), so no eviction is needed.
    const contentKey = getContentKey()
    const value = this.byContent.get(contentKey) ?? compute()
    this.byContent.set(contentKey, value)
    if (identityKey) {
      const map = identityMap ?? new Map<TSubKey, TValue>()
      map.set(subKey, value)
      this.byIdentity.set(identityKey, map)
    }
    return value
  }
}
