import { posix } from 'node:path'
import type { HookPayload } from '../types.mts'
import { keyLooksPathLike } from './claire-paths.mts'
import { isRecord } from './core.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

/**
 * Best-effort runtime policy for sessions that load the checked-out ref's Codex hooks. Direct
 * Codex automation marks the checkout untrusted and does not load project hooks; `/shepherd`
 * also has no pre-dispatch changed-path gate. Directory entries match the path itself or as a
 * prefix.
 */
export const PROTECTED_HOOK_DIR_PREFIXES = [
  'dev/codex-hooks/',
  'dev/cursor-hooks/',
  'dev/agent-session-id/',
  'dev/pr-description/',
  'dev/plan-issue/',
  '.codex/rules/',
]
export const PROTECTED_HOOK_EXACT_FILES = [
  '.codex/config.toml',
  '.cursor/cli.json',
  '.cursor/hooks.json',
  '.cursor/permissions.json',
  '.cursor/sandbox.json',
  '.cursor/worktrees.json',
]

export function protectedHookPathMatch(rawToken: string): boolean {
  // Collapse dot segments (dev/./codex-hooks/policy.mts -> dev/codex-hooks/policy.mts) so a
  // literal protected path isn't missed just because it's spelled with redundant path noise.
  // Deliberately not resolved against the command's cwd (e.g. `cd dev && ... codex-hooks/x`) —
  // that's the cd-plus-relative-path indirection this module's payload-string inspection is
  // already documented not to catch (docs/development/ci.md's "Mid-session mutation" section).
  const token = rawToken === '' ? rawToken : posix.normalize(rawToken)
  if (PROTECTED_HOOK_EXACT_FILES.some(file => token === file || token.endsWith(`/${file}`))) {
    return true
  }

  return PROTECTED_HOOK_DIR_PREFIXES.some(prefix => {
    const bareDir = prefix.slice(0, -1)
    return (
      token === bareDir ||
      token.startsWith(prefix) ||
      token.endsWith(`/${bareDir}`) ||
      token.includes(`/${prefix}`)
    )
  })
}

export function hookPayloadReferencesProtectedHookPath(
  payload: HookPayload,
  command: string,
): boolean {
  return (
    hookValueReferencesProtectedHookPath(payload) || commandReferencesProtectedHookPath(command)
  )
}

export function commandReferencesProtectedHookPath(command: string): boolean {
  if (command.startsWith('*** Begin Patch')) {
    return patchReferencesProtectedHookPath(command)
  }

  // splitRedirections matches github-workflow.mts's own tokenizeShellWords call: without it, a
  // no-space redirect like `>dev/codex-hooks/policy.mts` stays fused to the operator and misses
  // the literal-prefix match.
  return tokenizeShellWords(command, { splitRedirections: true }).some(token =>
    protectedHookPathMatch(token),
  )
}

export function hookValueReferencesProtectedHookPath(value: unknown, key?: string): boolean {
  if (typeof value === 'string') {
    if (value.startsWith('*** Begin Patch')) {
      return patchReferencesProtectedHookPath(value)
    }

    return key !== undefined && keyLooksPathLike(key) && protectedHookPathMatch(value)
  }

  if (Array.isArray(value)) {
    return value.some(nestedValue => hookValueReferencesProtectedHookPath(nestedValue, key))
  }

  if (!isRecord(value)) {
    return false
  }

  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    if (nestedKey === 'command') {
      continue
    }

    if (hookValueReferencesProtectedHookPath(nestedValue, nestedKey)) {
      return true
    }
  }

  return false
}

const PATCH_HEADER_PREFIX = /^(?:\*\*\* (?:Add|Delete|Update) File:|\*\*\* Move to:)\s+/

export function patchReferencesProtectedHookPath(command: string): boolean {
  // Only header lines name the file apply_patch is touching. Scanning every line would also
  // match added/removed body text that merely mentions a protected path (e.g. docs describing
  // this gate), blocking edits that never touch a protected file.
  return command
    .split('\n')
    .filter(line => PATCH_HEADER_PREFIX.test(line))
    .some(line => protectedHookPathMatch(line.replace(PATCH_HEADER_PREFIX, '')))
}
