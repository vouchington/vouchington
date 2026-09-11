import type { MarkdownNode } from './markdown.mts'
import type { RepositoryCommandCatalog } from './repository-command-catalog.mts'
import { collectCodeCommands } from './verification-command.mts'
import {
  splitCommandSegments,
  stripEnvAssignments,
  takeFlagValue,
  tokenize,
} from './verification-command-tokens.mts'

const PNPM_BUILTINS = new Set([
  'add',
  'audit',
  'bin',
  'config',
  'create',
  'deploy',
  'dlx',
  'doctor',
  'exec',
  'fetch',
  'help',
  'import',
  'init',
  'install',
  'link',
  'list',
  'ls',
  'outdated',
  'pack',
  'publish',
  'rebuild',
  'remove',
  'rm',
  'root',
  'run',
  'store',
  'unlink',
  'update',
  'up',
  'why',
  'i',
])
const INTERPRETERS = new Set(['node', 'bash', 'sh', 'zsh'])
const INTERPRETER_INLINE = new Set(['-c', '-e', '-p'])
const SCRIPT_PATH = /(?:\/|\.(?:mts|ts|js|mjs|cjs|sh)$)/

function isVitest(token: string | undefined): boolean {
  return token === 'vitest' || (token !== undefined && /(?:^|\/)vitest$/.test(token))
}

function unresolved(detail: string): string {
  return `Verification command does not resolve: ${detail}`
}

function resolveVitest(tokens: string[], catalog: RepositoryCommandCatalog): string[] {
  const errors: string[] = []
  let index = 0
  while (index < tokens.length) {
    const project = takeFlagValue(tokens, index, ['--project'])
    if (project.value !== undefined) {
      if (!catalog.vitestProjects.has(project.value)) {
        errors.push(unresolved(`Vitest project "${project.value}" is not defined`))
      }
      index = project.next
      continue
    }
    const config = takeFlagValue(tokens, index, ['--config', '-c'])
    if (config.value !== undefined) {
      if (!catalog.pathExists(config.value)) {
        errors.push(unresolved(`${config.value} does not exist`))
      }
      index = config.next
      continue
    }
    index += 1
  }
  return errors
}

function resolveRepoPath(token: string, catalog: RepositoryCommandCatalog): string[] {
  if (!catalog.pathExists(token)) return [unresolved(`${token} does not exist`)]
  return []
}

function resolveInterpreter(tokens: string[], catalog: RepositoryCommandCatalog): string[] {
  for (const token of tokens.slice(1)) {
    if (!token.startsWith('-')) break
    if (INTERPRETER_INLINE.has(token.split('=')[0] ?? token)) return []
  }
  const pathToken = tokens.slice(1).find(token => !token.startsWith('-') && SCRIPT_PATH.test(token))
  return pathToken === undefined ? [] : resolveRepoPath(pathToken, catalog)
}

function resolvePnpm(tokens: string[], catalog: RepositoryCommandCatalog): string[] {
  let packageDir = ''
  let filtered = false
  let index = 1
  while (index < tokens.length) {
    const dir = takeFlagValue(tokens, index, ['--dir', '-C'])
    if (dir.value !== undefined) {
      packageDir = dir.value
      index = dir.next
      continue
    }
    const filter = takeFlagValue(tokens, index, ['--filter'])
    if (filter.value !== undefined) {
      filtered = true
      index = filter.next
      continue
    }
    if (tokens[index]?.startsWith('-')) {
      index += 1
      continue
    }
    break
  }
  const rest = tokens.slice(index)
  const errors: string[] = []
  if (rest[0] === 'exec') {
    if (isVitest(rest[1])) errors.push(...resolveVitest(rest.slice(1), catalog))
    return errors
  }
  const script =
    rest[0] === 'run' ? rest[1] : PNPM_BUILTINS.has(rest[0] ?? '') ? undefined : rest[0]
  if (script !== undefined && !filtered) {
    const scripts = catalog.scriptsIn(packageDir)
    if (scripts === undefined || !scripts.has(script)) errors.push(unresolved(script))
  }
  if (isVitest(rest[0])) errors.push(...resolveVitest(rest, catalog))
  return errors
}

function resolveSegment(segment: string, catalog: RepositoryCommandCatalog): string[] {
  const tokens = tokenize(stripEnvAssignments(segment))
  const executable = tokens[0]
  if (executable === undefined) return []
  if (executable === 'pnpm') return resolvePnpm(tokens, catalog)
  if (isVitest(executable)) return resolveVitest(tokens, catalog)
  if (executable.startsWith('./') || executable.startsWith('../')) {
    return resolveRepoPath(executable, catalog)
  }
  if (INTERPRETERS.has(executable)) return resolveInterpreter(tokens, catalog)
  return []
}

export function resolveVerificationCommands(
  nodes: MarkdownNode[],
  catalog: RepositoryCommandCatalog,
): string[] {
  return collectCodeCommands(nodes).flatMap(command =>
    splitCommandSegments(command).flatMap(segment => resolveSegment(segment, catalog)),
  )
}
