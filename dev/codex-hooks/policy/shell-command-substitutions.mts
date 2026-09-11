import { stripUnquotedShellComments } from './shell-tokenizer.mts'
import { stripQuotedHeredocBodies } from './shell-heredoc-parser.mts'

export function extractShellCommandSubstitutions(command: string): string[] {
  const source = stripUnquotedShellComments(stripQuotedHeredocBodies(command))
  const substitutions: string[] = []
  let quote: "'" | '"' | null = null
  let escaping = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (escaping) {
      escaping = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaping = true
      continue
    }
    if (char === "'" && quote !== '"') {
      quote = quote === "'" ? null : "'"
      continue
    }
    if (char === '"' && quote !== "'") {
      quote = quote === '"' ? null : '"'
      continue
    }
    if (quote === "'") {
      continue
    }
    if (char === '$' && source[index + 1] === '(') {
      const substitution = readParenthesizedSubstitution(source, index + 2)
      if (substitution !== null) {
        substitutions.push(substitution.command)
        index = substitution.endIndex
      }
      continue
    }
    if (char === '`') {
      const substitution = readBacktickSubstitution(source, index + 1)
      if (substitution !== null) {
        substitutions.push(substitution.command)
        index = substitution.endIndex
      }
    }
  }

  return substitutions
}

function readParenthesizedSubstitution(
  command: string,
  startIndex: number,
): { command: string; endIndex: number } | null {
  let depth = 1
  let quote: "'" | '"' | null = null
  let escaping = false

  for (let index = startIndex; index < command.length; index += 1) {
    const char = command[index]
    if (escaping) {
      escaping = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaping = true
      continue
    }
    if (char === "'" && quote !== '"') {
      quote = quote === "'" ? null : "'"
      continue
    }
    if (char === '"' && quote !== "'") {
      quote = quote === '"' ? null : '"'
      continue
    }
    if (quote === null && char === '(') {
      depth += 1
      continue
    }
    if (quote === null && char === ')' && --depth === 0) {
      return { command: command.slice(startIndex, index), endIndex: index }
    }
  }

  return null
}

function readBacktickSubstitution(
  command: string,
  startIndex: number,
): { command: string; endIndex: number } | null {
  let value = ''
  let escaping = false
  for (let index = startIndex; index < command.length; index += 1) {
    const char = command[index]
    if (escaping) {
      value += char === '`' || char === '\\' || char === '$' ? char : `\\${char}`
      escaping = false
      continue
    }
    if (char === '\\') {
      escaping = true
      continue
    }
    if (char === '`') {
      return { command: value, endIndex: index }
    }
    value += char
  }

  return null
}
