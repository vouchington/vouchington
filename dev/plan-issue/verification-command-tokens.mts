export const CD_PREFIX = /^(?:\(\s*)?cd\s+[\w./-]+\s+&&\s*/

export function tokenize(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  for (const char of command) {
    if (quote !== null) {
      if (char === quote) quote = null
      else current += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current !== '') tokens.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current !== '') tokens.push(current)
  return tokens
}

export function splitCommandSegments(command: string): string[] {
  const stripped = CD_PREFIX.test(command)
    ? command.replace(CD_PREFIX, '').replace(/\)\s*$/, '')
    : command
  const segments: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  for (let index = 0; index < stripped.length; index += 1) {
    const char = stripped[index]
    if (quote !== null) {
      if (char === quote) quote = null
      current += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    if (
      char === ';' ||
      ((char === '&' || char === '|') && stripped[index + 1] === char) ||
      char === '|'
    ) {
      if (current.trim() !== '') segments.push(current.trim())
      current = ''
      if (char === '&' || (char === '|' && stripped[index + 1] === '|')) index += 1
      continue
    }
    current += char
  }
  if (current.trim() !== '') segments.push(current.trim())
  return segments
}

export function takeFlagValue(
  tokens: string[],
  index: number,
  names: string[],
): { next: number; value: string | undefined } {
  const token = tokens[index]
  if (token === undefined) return { next: index, value: undefined }
  for (const name of names) {
    if (token === name) return { next: index + 2, value: tokens[index + 1] }
    if (token.startsWith(`${name}=`))
      return { next: index + 1, value: token.slice(name.length + 1) }
  }
  return { next: index, value: undefined }
}

export function stripEnvAssignments(command: string): string {
  return command.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*/, '')
}
