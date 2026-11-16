/** Preserve quoted and folded Message-ID values when reading References headers. */
export function parseMessageIds(value: string): string[] {
  const ids: string[] = []
  let index = 0
  while (index < value.length) {
    while (index < value.length && /[\s,]/.test(value[index]!)) index += 1
    if (index === value.length) break
    if (value[index] === '<') {
      const angle = scanAngleId(value, index)
      if (angle.closed) ids.push(value.slice(index, angle.end))
      index = angle.end
    } else {
      const bare = scanBareId(value, index)
      ids.push(`<${value.slice(index, bare)}>`)
      index = bare
    }
  }
  return ids
}

function scanAngleId(value: string, from: number): { end: number; closed: boolean } {
  let quoted = false
  let escaped = false
  let index = from + 1
  while (index < value.length) {
    const char = value[index++]!
    if (escaped) escaped = false
    else if (char === '\\' && quoted) escaped = true
    else if (char === '"') quoted = !quoted
    else if (char === '>' && !quoted) break
  }
  return { end: index, closed: value[index - 1] === '>' && !quoted }
}

function scanBareId(value: string, from: number): number {
  let index = from
  while (index < value.length && !/[\s,]/.test(value[index]!)) index += 1
  return index
}
