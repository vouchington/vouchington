import type { ApiKey } from '@/types/api-keys'

export function rotatedKeyState(
  previous: readonly ApiKey[],
  old: ApiKey | undefined,
  replacement: ApiKey,
  now: number,
): ApiKey[] {
  const expiresAt = new Date(
    Math.min(old?.expires_at ? new Date(old.expires_at).getTime() : Infinity, now + 86_400_000),
  ).toISOString()
  return [
    replacement,
    ...(old ? [{ ...old, replaced_by_api_key_id: replacement.id, expires_at: expiresAt }] : []),
    ...previous.filter(key => key.id !== old?.id && key.id !== replacement.id),
  ]
}
