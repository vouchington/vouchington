export function formatUnknownValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'symbol') return value.toString()
  if (typeof value === 'function') return '[Function]'

  const ancestors: object[] = []
  try {
    return (
      JSON.stringify(value, function (this: unknown, _key, item: unknown) {
        if (typeof item === 'bigint') return item.toString()
        if (item !== null && typeof item === 'object') {
          while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop()
          if (ancestors.includes(item)) return '[Circular]'
          ancestors.push(item)
        }
        return item
      }) ?? '[Unserializable object]'
    )
  } catch {
    return '[Unserializable object]'
  }
}
