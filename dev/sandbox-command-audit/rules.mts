import { resolve } from 'node:path'
import type { AuditRules } from 'vouchington-tooling/sandbox-command-audit'
import { isGitMetadataPermissionDenial } from './git-metadata-denial.mts'
import { isCoveredByPolicy, loadSandboxPolicy } from './policy.mts'

export const rules: AuditRules = {
  loadPolicy({ cwd, settingsPath }) {
    const policy = loadSandboxPolicy(settingsPath ?? resolve(cwd, '.claude/settings.json'))
    if ('error' in policy) return policy
    return {
      covers(list, command) {
        const tokens =
          list === 'allow'
            ? policy.allowListTokens
            : list === 'deny'
              ? policy.denyListTokens
              : policy.excludedCommandTokens
        return isCoveredByPolicy(command, tokens)
      },
    }
  },
  classifyFailure(command, text) {
    return isGitMetadataPermissionDenial(command, text) ? 'worktree-denial' : undefined
  },
  worktreeGlobs: ['.grok/worktrees/*'],
}
