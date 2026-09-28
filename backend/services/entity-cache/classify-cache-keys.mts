import { isUUID, isUsernameOrSlug } from '@modules/utils'
import { normalizeKey } from '@ts-shared/utils/strings'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

// getCacheKeys classifies strings as UUIDs or slugs/usernames.
// URL strings (https://...) match neither and are intentionally excluded — use getUrlLookupKeys.
export function getCacheKeys(keys: unknown[]): { ids: Set<string>; slugs: Set<string> } {
  const stringKeys: string[] = (keys.flat(Infinity) as unknown[]).flatMap((x: unknown) => {
    if (!x) return []
    // all possible keys from an object
    if (typeof x === 'object' && x !== null) {
      const obj = x as Record<string, unknown>
      return [obj.id, obj.slug, obj.username].flatMap(v =>
        typeof v === 'string' && v !== '' ? [normalizeKey(v)] : [],
      )
    }
    if (typeof x === 'string') return x !== '' ? [normalizeKey(x)] : []
    throw new Error(`Invalid key: ${stringFromUnknown(x)}`)
  })

  const ids = new Set(stringKeys.filter(isUUID))
  // Exclude UUIDs from slugs: isSlug matches /^[a-z0-9-]+$/ which also matches UUID strings.
  const slugs = new Set(stringKeys.filter(k => isUsernameOrSlug(k) && !isUUID(k)))

  return { ids, slugs }
}
