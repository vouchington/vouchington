export function commandSegments(command: string): string[] {
  const segments: string[] = []
  let start = 0
  let quote: "'" | '"' | undefined
  let escaped = false

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote !== undefined) {
      if (character === quote) quote = undefined
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    const startsComment = character === '#' && (index === start || /\s/.test(command[index - 1]!))
    if (startsComment) {
      const segment = command.slice(start, index).trim()
      if (segment.length > 0) segments.push(segment)
      const newlineIndex = command.indexOf('\n', index + 1)
      if (newlineIndex < 0) {
        start = command.length
        break
      }
      index = newlineIndex
      start = newlineIndex + 1
      continue
    }

    const pairedSeparator =
      (character === '&' && command[index + 1] === '&') ||
      (character === '|' && command[index + 1] === '|')
    const ampersandIsRedirection =
      character === '&' &&
      (command[index - 1] === '>' || command[index - 1] === '<' || command[index + 1] === '>')
    const singleSeparator =
      character === ';' ||
      character === '|' ||
      (character === '&' && !ampersandIsRedirection) ||
      /[\r\n]/.test(character)
    if (!pairedSeparator && !singleSeparator) continue

    const segment = command.slice(start, index).trim()
    if (segment.length > 0) segments.push(segment)
    if (pairedSeparator) index += 1
    start = index + 1
  }

  const finalSegment = command.slice(start).trim()
  if (finalSegment.length > 0) segments.push(finalSegment)
  return segments
}
