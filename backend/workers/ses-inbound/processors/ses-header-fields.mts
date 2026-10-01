export type HeaderField = { name: string; value: string }

/** Reads the RFC 5322 header block (up to the first blank line) with unfolded, lower-cased names. */
export function readHeaderFields(message: string): HeaderField[] {
  const fields: HeaderField[] = []
  for (const line of message.split(/\r?\n/)) {
    if (line === '') break
    if (line.startsWith(' ') || line.startsWith('\t')) {
      const previous = fields.at(-1)
      if (previous) previous.value += ` ${line.trim()}`
      continue
    }
    const colon = line.indexOf(':')
    if (colon > 0) {
      fields.push({
        name: line.slice(0, colon).trim().toLowerCase(),
        value: line.slice(colon + 1).trim(),
      })
    }
  }
  return fields
}

/** Splits on `;` outside quoted strings and drops RFC 5322 comments, which may contain `;` and `=`. */
export function splitAuthResults(value: string): string[] {
  const segments: string[] = []
  let current = ''
  let commentDepth = 0
  let quoted = false
  for (let index = 0; index < value.length; index++) {
    const char = value.charAt(index)
    if (char === '\\') {
      if (commentDepth === 0) current += `${char}${value.charAt(index + 1)}`
      index++
    } else if (commentDepth === 0 && char === '"') {
      quoted = !quoted
      current += char
    } else if (!quoted && char === '(') {
      commentDepth++
    } else if (!quoted && char === ')' && commentDepth > 0) {
      commentDepth--
    } else if (commentDepth > 0) {
      continue
    } else if (!quoted && char === ';') {
      segments.push(current)
      current = ''
    } else {
      current += char
    }
  }
  segments.push(current)
  return segments
}
