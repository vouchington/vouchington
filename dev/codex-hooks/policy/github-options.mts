import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function ghBodyIsOpaqueToHook(options: GhOptions): boolean {
  const inlineBody = options.body.at(-1)
  if (inlineBody !== undefined) {
    // Inline body containing unexpanded shell substitutions ($(cmd) or `cmd`) cannot
    // be evaluated by the hook — treat as opaque to avoid false positives.
    return /\$\(|`/.test(inlineBody)
  }

  const bodyFile = options.bodyFile.at(-1)
  if (bodyFile === undefined) {
    return false
  }

  return bodyFile === '-'
}

export function addOptionValue(
  options: GhOptions,
  key: Exclude<keyof GhOptions, 'draft'>,
  value: string | undefined,
): boolean {
  if (value === undefined) {
    return false
  }

  options[key].push(value)
  return true
}

export function attachedShortOptionValue(token: string, flag: string): string | null {
  if (token.startsWith(`${flag}=`)) {
    return token.slice(flag.length + 1)
  }

  if (token.startsWith(flag) && token.length > flag.length) {
    return token.slice(flag.length)
  }

  return null
}

export function optionValueFromLongToken(token: string, option: string): string | null {
  if (!token.startsWith(`${option}=`)) {
    return null
  }

  return token.slice(option.length + 1)
}

export function isGhCommandSeparator(token: string): boolean {
  return (
    token === '&&' ||
    token === '&' ||
    token === '(' ||
    token === ')' ||
    token === ';' ||
    token === '|' ||
    token === '||' ||
    token === '\n'
  )
}
export type GhOptions = {
  body: string[]
  bodyFile: string[]
  draft: boolean
  label: string[]
  repo: string[]
  title: string[]
}

export function parseGhOptions(tokens: string[]): GhOptions {
  const options: GhOptions = {
    body: [],
    bodyFile: [],
    draft: false,
    label: [],
    repo: [],
    title: [],
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (isGhCommandSeparator(token)) {
      break
    }

    const nextToken = tokens[index + 1]
    if (token === '--draft') {
      options.draft = true
      continue
    }
    if ((token === '--body' || token === '-b') && addOptionValue(options, 'body', nextToken)) {
      index += 1
      continue
    }
    const attachedBody =
      optionValueFromLongToken(token, '--body') ?? attachedShortOptionValue(token, '-b')
    if (addOptionValue(options, 'body', attachedBody ?? undefined)) {
      continue
    }
    if (
      (token === '--body-file' || token === '-F') &&
      addOptionValue(options, 'bodyFile', nextToken)
    ) {
      index += 1
      continue
    }
    const attachedBodyFile =
      optionValueFromLongToken(token, '--body-file') ?? attachedShortOptionValue(token, '-F')
    if (addOptionValue(options, 'bodyFile', attachedBodyFile ?? undefined)) {
      continue
    }
    if ((token === '--label' || token === '-l') && addOptionValue(options, 'label', nextToken)) {
      index += 1
      continue
    }
    const attachedLabel =
      optionValueFromLongToken(token, '--label') ?? attachedShortOptionValue(token, '-l')
    if (addOptionValue(options, 'label', attachedLabel ?? undefined)) {
      continue
    }
    if ((token === '--repo' || token === '-R') && addOptionValue(options, 'repo', nextToken)) {
      index += 1
      continue
    }
    const attachedRepo =
      optionValueFromLongToken(token, '--repo') ?? attachedShortOptionValue(token, '-R')
    if (addOptionValue(options, 'repo', attachedRepo ?? undefined)) {
      continue
    }
    if ((token === '--title' || token === '-t') && addOptionValue(options, 'title', nextToken)) {
      index += 1
      continue
    }
    const attachedTitle =
      optionValueFromLongToken(token, '--title') ?? attachedShortOptionValue(token, '-t')
    if (addOptionValue(options, 'title', attachedTitle ?? undefined)) {
      continue
    }
  }

  return options
}

export function ghBodyFromOptions(options: GhOptions, cwd: string): string | null {
  const inlineBody = options.body.at(-1)
  if (inlineBody !== undefined) {
    return inlineBody
  }

  const bodyFile = options.bodyFile.at(-1)
  if (bodyFile === undefined || bodyFile === '-') {
    return null
  }

  for (const candidate of bodyFileCandidates(cwd, bodyFile)) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      continue
    }
  }

  return null
}

export function bodyFileCandidates(cwd: string, bodyFile: string): string[] {
  const candidates = [resolve(cwd, bodyFile)]
  const expanded = expandShellLikePath(bodyFile)
  if (expanded !== bodyFile) {
    candidates.push(resolve(cwd, expanded))
  }

  return [...new Set(candidates)]
}

export function expandShellLikePath(path: string): string {
  let expanded = path
  if (expanded === '~' || expanded.startsWith('~/')) {
    const home = process.env.HOME
    if (home !== undefined) {
      expanded = `${home}${expanded.slice(1)}`
    }
  }

  return expanded.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, match => {
    const name = match.startsWith('${') ? match.slice(2, -1) : match.slice(1)
    return process.env[name] ?? match
  })
}
