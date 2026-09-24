export type HeredocSpec = {
  delimiter: string
  expandsSubstitutions: boolean
  stripLeadingTabs: boolean
}

export function heredocSpecsFromLine(line: string): HeredocSpec[] {
  const specs: HeredocSpec[] = []

  let quote: "'" | '"' | null = null
  let escaping = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (escaping) {
      escaping = false
      continue
    }

    if (char === '\\' && quote !== "'") {
      escaping = true
      continue
    }

    if (quote !== null) {
      if (quote === '"' && char === '$' && line[index + 1] === '(') {
        quote = null
        index += 1
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      continue
    }

    if (char === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
      break
    }

    if (char !== '<' || line[index + 1] !== '<') {
      continue
    }
    // `<<<` opens a here-string, whose word ends on this line: no body follows.
    if (line[index + 2] === '<') {
      index += 2
      continue
    }

    const stripLeadingTabs = line[index + 2] === '-'
    let cursor = index + (stripLeadingTabs ? 3 : 2)
    while (cursor < line.length && /\s/.test(line[cursor])) {
      cursor += 1
    }

    const delimiter = readHeredocDelimiter(line, cursor)
    if (delimiter !== null) {
      specs.push({
        delimiter: delimiter.value,
        expandsSubstitutions: delimiter.expandsSubstitutions,
        stripLeadingTabs,
      })
      index = delimiter.endIndex
    }
  }

  return specs
}

function readHeredocDelimiter(
  line: string,
  startIndex: number,
): { value: string; endIndex: number; expandsSubstitutions: boolean } | null {
  let value = ''
  let cursor = startIndex
  let quote: "'" | '"' | null = null
  let quoted = false

  while (cursor < line.length) {
    const char = line[cursor]
    if (quote === null && /[\s;&|()<>]/.test(char)) {
      break
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null
        cursor += 1
        continue
      }
      if (quote === '"' && char === '\\' && cursor + 1 < line.length) {
        const nextChar = line[cursor + 1]
        if (new Set(['$', '`', '"', '\\']).has(nextChar)) {
          value += nextChar
          cursor += 2
          continue
        }
      }
      value += char
      cursor += 1
      continue
    }
    if (char === "'" || char === '"') {
      quoted = true
      quote = char
      cursor += 1
      continue
    }
    if (char === '\\') {
      const nextChar = line[cursor + 1]
      if (nextChar === undefined) {
        return null
      }
      quoted = true
      value += nextChar
      cursor += 2
      continue
    }
    value += char
    cursor += 1
  }

  if (value === '' || quote !== null) {
    return null
  }

  return { value, endIndex: cursor - 1, expandsSubstitutions: !quoted }
}
