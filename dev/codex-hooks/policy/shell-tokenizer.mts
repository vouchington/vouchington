import { readAnsiCString } from './ansi-c-string.mts'
import { isRedirectionFd, shellRedirectionOperatorAt } from './shell-redirections.mts'

const DOUBLE_QUOTE_ESCAPE_CHARS = new Set(['$', '`', '"', '\\', '\n'])

export type ShellWord = { expandable: boolean; value: string }

export function tokenizeShellWordsDetailed(
  command: string,
  options: { splitRedirections?: boolean } = {},
): ShellWord[] {
  const commandWithoutComments = stripUnquotedShellComments(command)
  const tokens: ShellWord[] = []
  let token = ''
  let expandable = false
  let quote: "'" | '"' | null = null
  let escaping = false

  function pushToken(): void {
    if (token === '') return
    tokens.push({ expandable, value: token })
    token = ''
    expandable = false
  }

  for (let index = 0; index < commandWithoutComments.length; index += 1) {
    const char = commandWithoutComments[index]
    if (escaping) {
      if (quote === '"' && !DOUBLE_QUOTE_ESCAPE_CHARS.has(char!)) {
        token += `\\${char}`
      } else {
        token += char
      }
      escaping = false
      continue
    }

    if (quote === null && char === '$' && commandWithoutComments[index + 1] === "'") {
      const ansiString = readAnsiCString(commandWithoutComments, index + 2)
      if (ansiString !== null) {
        token += ansiString.value
        index = ansiString.endIndex
        continue
      }
    }

    if (char === '\\') {
      if (quote === "'") {
        token += char
        continue
      }

      escaping = true
      continue
    }

    if (quote !== "'" && (char === '$' || char === '`')) expandable = true

    if (quote !== null) {
      if (char === quote) {
        quote = null
      } else {
        token += char
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      continue
    }

    if (char === '\n') {
      pushToken()
      tokens.push({ expandable: false, value: '\n' })
      continue
    }

    if (/\s/.test(char)) {
      pushToken()
      continue
    }

    const redirectionOperator =
      options.splitRedirections === true
        ? shellRedirectionOperatorAt(commandWithoutComments, index)
        : null
    if (redirectionOperator !== null) {
      if (isRedirectionFd(token)) {
        tokens.push({ expandable, value: `${token}${redirectionOperator}` })
        token = ''
        expandable = false
      } else if (token !== '') {
        pushToken()
        tokens.push({ expandable: false, value: redirectionOperator })
      } else {
        tokens.push({ expandable: false, value: redirectionOperator })
      }
      index += redirectionOperator.length - 1
      continue
    }

    if (char === '&' || char === '|' || char === ';' || char === '(' || char === ')') {
      pushToken()

      const previousToken = tokens.at(-1)?.value
      if ((char === '&' && previousToken === '&') || (char === '|' && previousToken === '|')) {
        tokens[tokens.length - 1] = { expandable: false, value: `${previousToken}${char}` }
      } else {
        tokens.push({ expandable: false, value: char })
      }
      continue
    }

    if (
      quote === null &&
      (char === '*' ||
        char === '?' ||
        char === '[' ||
        (char === '{' && /^\{[^}]*(?:,|\.\.)[^}]*\}/.test(commandWithoutComments.slice(index))))
    )
      expandable = true
    token += char
  }

  pushToken()
  return tokens
}

export function tokenizeShellWords(
  command: string,
  options: { splitRedirections?: boolean } = {},
): string[] {
  return tokenizeShellWordsDetailed(command, options).map(token => token.value)
}

export function stripUnquotedShellComments(command: string): string {
  let result = ''
  let quote: "'" | '"' | null = null
  let escaping = false
  let wordStarted = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaping) {
      result += char
      escaping = false
      continue
    }

    if (quote === null && char === '$' && command[index + 1] === "'") {
      const ansiString = readAnsiCString(command, index + 2)
      if (ansiString !== null) {
        result += command.slice(index, ansiString.endIndex + 1)
        wordStarted = true
        index = ansiString.endIndex
        continue
      }
    }

    if (char === '\\' && quote !== "'") {
      result += char
      wordStarted = true
      escaping = true
      continue
    }

    if (quote !== null) {
      result += char
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"') {
      result += char
      quote = char
      wordStarted = true
      continue
    }

    if (char === '#' && !wordStarted) {
      while (index + 1 < command.length && command[index + 1] !== '\n') {
        index += 1
      }
      continue
    }

    result += char
    if (char === '\n' || /\s/.test(char) || /[&|;()]/.test(char)) {
      wordStarted = false
    } else {
      wordStarted = true
    }
  }

  return result
}
