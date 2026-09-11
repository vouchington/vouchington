import assert from 'http-assert'
import { normalizeHostname } from '@ts-shared/utils/urls'

export function normalizeStringArray(
  values: string[] | undefined,
  { lower = false }: { lower?: boolean } = {},
) {
  if (!values) return []
  const normalized = values.flatMap(value => {
    const trimmed = value.trim()
    return trimmed ? [lower ? trimmed.toLowerCase() : trimmed] : []
  })

  return [...new Set(normalized)]
}

export function normalizeHostnames(values: string[] | undefined): string[] {
  if (!values) return []
  const normalized: string[] = []
  for (const value of values) {
    if (!value.trim()) continue
    const hostname = normalizeHostname(value)
    assert(hostname !== null, 422, `Invalid hostname: ${value.trim()}`)
    normalized.push(hostname)
  }
  return [...new Set(normalized)]
}
