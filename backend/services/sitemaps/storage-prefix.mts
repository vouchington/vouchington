export function applyStoragePrefix(key: string): string {
  const prefix = getConfiguredStoragePrefix()
  return prefix ? `${prefix}${key}` : key
}

export function stripStoragePrefix(key: string): string {
  const prefix = getConfiguredStoragePrefix()
  if (!prefix) return key
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}

function getConfiguredStoragePrefix(): string {
  const raw = process.env.SITEMAP_S3_PREFIX?.trim().replace(/^\/+|\/+$/g, '')
  return raw ? `${raw}/` : ''
}
