export { commandSegments } from './git-metadata-command-segments.mts'
export function hasUnsafeShellEvaluation(segment: string): boolean {
  let quote: "'" | '"' | undefined
  let escaped = false

  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index]!
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote === "'") {
      if (character === "'") quote = undefined
      continue
    }
    if (quote === '"') {
      if (character === '"') quote = undefined
      else if (character === '`' || (character === '$' && segment[index + 1] === '(')) {
        return true
      }
      continue
    }
    if (character === "'") {
      quote = "'"
      continue
    }
    if (character === '"') {
      quote = '"'
      continue
    }
    if (character === '`' || (character === '$' && segment[index + 1] === '(')) {
      return true
    }
    if (character !== '<' && character !== '>') continue

    const descriptorTarget = segment.slice(index + 1).match(/^&[\d-]+/)
    if (descriptorTarget === null) return true
    index += descriptorTarget[0].length
  }
  return false
}
