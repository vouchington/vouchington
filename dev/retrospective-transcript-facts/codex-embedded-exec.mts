import { extractCommandArg } from './exec-program-args.mts'

export function findEmbeddedExecCommands(source: string): string[] {
  const marker = 'tools.exec_command('
  const commands: string[] = []
  let quote: '"' | "'" | '`' | undefined
  let escaped = false
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = undefined
      index++
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      index++
      continue
    }
    if (!source.startsWith(marker, index)) {
      index++
      continue
    }
    let objectStart = index + marker.length
    while (/\s/.test(source[objectStart] ?? '')) objectStart++
    if (source[objectStart] !== '{') {
      index += marker.length
      continue
    }
    // Tracks all three quote types (not just `"`), matching the outer scan above — a
    // single- or backtick-quoted value containing a brace (an `rg` pattern argument,
    // say) would otherwise mis-balance the object before extraction is even reached.
    let depth = 0
    let objectQuote: '"' | "'" | '`' | undefined
    let objectEscaped = false
    let objectEnd = objectStart
    for (; objectEnd < source.length; objectEnd++) {
      const objectChar = source[objectEnd]
      if (objectQuote) {
        if (objectEscaped) objectEscaped = false
        else if (objectChar === '\\') objectEscaped = true
        else if (objectChar === objectQuote) objectQuote = undefined
        continue
      }
      if (objectChar === '"' || objectChar === "'" || objectChar === '`') objectQuote = objectChar
      else if (objectChar === '{') depth++
      else if (objectChar === '}' && --depth === 0) break
    }
    if (depth !== 0) {
      index += marker.length
      continue
    }
    const command = extractCommandArg(source.slice(objectStart, objectEnd + 1))
    if (command) commands.push(command)
    index = objectEnd + 1
  }
  return commands
}
