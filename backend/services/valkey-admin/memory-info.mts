const REQUIRED_INTEGER_MEMORY_FIELDS = {
  used_memory: 'usedMemoryBytes',
  used_memory_rss: 'usedMemoryRssBytes',
  used_memory_peak: 'usedMemoryPeakBytes',
  maxmemory: 'maxmemoryBytes',
} as const

const OPTIONAL_INTEGER_MEMORY_FIELDS = {
  used_memory_dataset: 'usedMemoryDatasetBytes',
  lazyfree_pending_objects: 'lazyfreePendingObjects',
} as const

export type ValkeyMemorySummary = {
  usedMemoryBytes: number
  usedMemoryRssBytes: number
  usedMemoryPeakBytes: number
  maxmemoryBytes: number
  maxmemoryPolicy: string
  usedMemoryDatasetBytes: number | null
  lazyfreePendingObjects: number | null
  memFragmentationRatio: number | null
}

export function parseValkeyMemoryInfo(info: string): ValkeyMemorySummary {
  const fields = new Map<string, string>()
  for (const line of info.split(/\r?\n/)) {
    if (line === '' || line.startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator === -1) continue
    fields.set(line.slice(0, separator), line.slice(separator + 1))
  }

  const requiredIntegers = Object.fromEntries(
    Object.entries(REQUIRED_INTEGER_MEMORY_FIELDS).map(([field, outputField]) => [
      outputField,
      parseNonNegativeSafeInteger(fields, field, true),
    ]),
  ) as Pick<
    ValkeyMemorySummary,
    'usedMemoryBytes' | 'usedMemoryRssBytes' | 'usedMemoryPeakBytes' | 'maxmemoryBytes'
  >
  const maxmemoryPolicy = fields.get('maxmemory_policy')
  if (!maxmemoryPolicy) throw new Error('Missing required INFO memory field: maxmemory_policy')
  const optionalIntegers = Object.fromEntries(
    Object.entries(OPTIONAL_INTEGER_MEMORY_FIELDS).map(([field, outputField]) => [
      outputField,
      parseNonNegativeSafeInteger(fields, field, false),
    ]),
  ) as Pick<ValkeyMemorySummary, 'usedMemoryDatasetBytes' | 'lazyfreePendingObjects'>
  return {
    ...requiredIntegers,
    maxmemoryPolicy,
    ...optionalIntegers,
    memFragmentationRatio: parseOptionalNonNegativeNumber(fields, 'mem_fragmentation_ratio'),
  }
}

function parseNonNegativeSafeInteger(
  fields: ReadonlyMap<string, string>,
  field: string,
  required: boolean,
): number | null {
  const value = fields.get(field)
  if (value === undefined) {
    if (required) throw new Error(`Missing required INFO memory field: ${field}`)
    return null
  }
  if (!/^\d+$/.test(value)) throw new Error(`Malformed INFO memory field: ${field}`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`Malformed INFO memory field: ${field}`)
  return parsed
}

function parseOptionalNonNegativeNumber(
  fields: ReadonlyMap<string, string>,
  field: string,
): number | null {
  const value = fields.get(field)
  if (value === undefined) return null
  if (value === '') throw new Error(`Malformed INFO memory field: ${field}`)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Malformed INFO memory field: ${field}`)
  }
  return parsed
}
