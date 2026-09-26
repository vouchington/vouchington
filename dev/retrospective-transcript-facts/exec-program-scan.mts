export type ScanState = { source: string; index: number }

export function readQuotedString(state: ScanState): string | undefined {
  const quote = state.source[state.index]
  if (quote !== '"' && quote !== "'" && quote !== '`') return undefined
  state.index++
  let value = ''
  let escaped = false
  while (state.index < state.source.length) {
    const char = state.source[state.index]
    if (escaped) {
      if (char === 'n') value += '\n'
      else if (char === 't') value += '\t'
      else if (char === 'r') value += '\r'
      else value += char
      escaped = false
      state.index++
      continue
    }
    if (char === '\\') {
      escaped = true
      state.index++
      continue
    }
    if (char === quote) {
      state.index++
      return value
    }
    value += char
    state.index++
  }
  return undefined // unterminated — caller treats this the same as no match
}

export function skipValue(state: ScanState): void {
  const char = state.source[state.index]
  if (char === '"' || char === "'" || char === '`') {
    readQuotedString(state)
    return
  }
  if (char === '{' || char === '[') {
    const open = char
    const close = open === '{' ? '}' : ']'
    let depth = 0
    while (state.index < state.source.length) {
      const inner = state.source[state.index]
      if (inner === '"' || inner === "'" || inner === '`') {
        readQuotedString(state)
        continue
      }
      if (inner === open) depth++
      else if (inner === close && --depth === 0) {
        state.index++
        return
      }
      state.index++
    }
    return
  }
  while (state.index < state.source.length && !/[,}\]]/.test(state.source[state.index] ?? '')) {
    state.index++
  }
}

// Depth-1 only: a nested object's own `cmd`/`command` key (however unlikely in practice)
// must never be mistaken for the top-level argument's field, so non-string and container
// values are always skipped rather than descended into.
