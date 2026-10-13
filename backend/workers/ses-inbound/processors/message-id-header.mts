/** Preserve quoted and folded Message-ID values when reading References headers. */
export function parseMessageIds(value: string): string[] {
  const ids: string[] = []
  let index = 0
  while (index < value.length) {
    while (index < value.length && /[\s,]/.test(value[index]!)) index += 1
    if (index === value.length) break
    const start = index
    if (value[index] === '<') {
      let quoted = false
      let escaped = false
      index += 1
      while (index < value.length) {
        const char = value[index++]!
        if (escaped) escaped = false
        else if (char === '\\' && quoted) escaped = true
        else if (char === '"') quoted = !quoted
        else if (char === '>' && !quoted) break
      }
      if (value[index - 1] === '>' && !quoted) ids.push(value.slice(start, index))
    } else {
      while (index < value.length && !/[\s,]/.test(value[index]!)) index += 1
      ids.push(`<${value.slice(start, index)}>`)
    }
  }
  return ids
}
