type MaskedSegment = Readonly<{
  text: string
  endIndex: number
}>

export function maskLineComment(source: string, startIndex: number): MaskedSegment {
  let text = '  '
  let index = startIndex + 2
  while (index < source.length && source[index] !== '\n') {
    text += ' '
    index += 1
  }
  if (source[index] === '\n') {
    text += '\n'
    index += 1
  }
  return { text, endIndex: index }
}

export function maskBlockComment(source: string, startIndex: number): MaskedSegment {
  let text = '  '
  let index = startIndex + 2
  let depth = 1
  while (index < source.length && depth > 0) {
    const character = source[index]!
    const next = source[index + 1]
    if (character === '/' && next === '*') {
      depth += 1
      text += '  '
      index += 2
    } else if (character === '*' && next === '/') {
      depth -= 1
      text += '  '
      index += 2
    } else {
      text += character === '\n' ? '\n' : ' '
      index += 1
    }
  }
  return { text, endIndex: index }
}

export function maskQuotedLiteral(
  source: string,
  startIndex: number,
  delimiter: '"' | "'",
): MaskedSegment {
  let text = ' '
  let index = startIndex + 1
  while (index < source.length) {
    const character = source[index]!
    const next = source[index + 1]
    if (character === '\\') {
      text += next === '\n' ? ' \n' : '  '
      index += 2
    } else if (character === delimiter) {
      text += ' '
      index += 1
      break
    } else {
      text += character === '\n' ? '\n' : ' '
      index += 1
    }
  }
  return { text, endIndex: index }
}
