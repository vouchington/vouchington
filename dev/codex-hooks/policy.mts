import {
  commandsToInspectForGitPolicy,
  findGitHubWorkflowBlock,
  type GitHubWorkflowPolicyOptions,
  hookCwd,
  hookPayloadReferencesClairePath,
  hookPayloadReferencesProtectedHookPath,
  isInteractiveRebaseContinue,
  type BlockDecision,
} from './policy-helpers.mts'
import {
  blockedDevServerPatterns,
  blockedHookBypassPatterns,
  findBlockedGitReason,
} from './policy/blocked-command-patterns.mts'
import { DEFAULT_AUTOMATION_CONTEXT } from './policy/core.mts'
import { findInteractiveMergeConfirm } from './policy/github-merge-authority.mts'
import { extractToolCommand } from './hook-payload.mts'
import {
  type PreToolUseOptions,
  renderConfirmDisposition,
} from './policy/pre-tool-use-confirm-output.mts'
import type { HookPayload } from './types.mts'

export type { PreToolUseOptions } from './policy/pre-tool-use-confirm-output.mts'

export type { HookPayload } from './types.mts'

// Every check that can block runs first; the interactive lone-merge confirm is the final return,
// so a block anywhere in the command always beats the merge allow.
export function findPreToolUseBlock(
  payload: HookPayload,
  options: GitHubWorkflowPolicyOptions = {},
): BlockDecision | null {
  const command = extractToolCommand(payload)
  const automationContext = options.automationContext ?? DEFAULT_AUTOMATION_CONTEXT
  if (hookPayloadReferencesClairePath(payload, command)) {
    return {
      reason: 'Typo: .claire should be .claude.',
    }
  }
  if (automationContext && hookPayloadReferencesProtectedHookPath(payload, command)) {
    return {
      reason:
        'Cannot Edit/Write/apply_patch the permission-enforcement hooks (dev/codex-hooks/**, ' +
        'dev/cursor-hooks/**, dev/agent-session-id/**), the modules they statically import (dev/pr-description/**, ' +
        'dev/plan-issue/**), or execpolicy configuration (.codex/config.toml, .codex/rules/**, ' +
        '.cursor/*.json) ' +
        'during an autonomous CI run. This closes the mid-session self-mutation gap a pre-dispatch ' +
        'diff gate cannot catch (#8009): a dispatched session could otherwise Edit/Write/apply_patch ' +
        'these files and have a later gh pr merge run against the now-weakened, freshly-mutated ' +
        'hook code. Interactive sessions are unaffected.',
    }
  }
  if (command.startsWith('*** Begin Patch')) {
    return null
  }
  if (!command) {
    return null
  }

  const ghBlock = findGitHubWorkflowBlock(command, hookCwd(payload), options)
  if (ghBlock !== null) {
    return ghBlock
  }

  for (const commandToInspect of commandsToInspectForGitPolicy(command)) {
    for (const { pattern, reason } of blockedHookBypassPatterns) {
      if (pattern.test(commandToInspect)) {
        return { reason }
      }
    }
  }

  for (const commandToInspect of commandsToInspectForGitPolicy(command)) {
    for (const { pattern, reason } of blockedDevServerPatterns) {
      if (pattern.test(commandToInspect)) {
        return { reason }
      }
    }
  }

  if (/\bgit\b/.test(command)) {
    for (const commandToInspect of commandsToInspectForGitPolicy(command)) {
      if (isInteractiveRebaseContinue(commandToInspect)) {
        return {
          reason:
            'Use "GIT_EDITOR=true git rebase --continue" so rebase continuation stays noninteractive.',
        }
      }

      const reason = findBlockedGitReason(commandToInspect)
      if (reason !== null) {
        return { reason }
      }
    }
  }

  return findInteractiveMergeConfirm(command, automationContext)
}

/**
 * True when this process is running inside GitHub Actions automation, where merge authority is
 * never delegated to an agent. Interactive sessions (Claude or Codex, run by a human) may proceed
 * only through the separate explicit-confirmation path. See docs/development/merge-authority.md.
 */
export function isAutomationContext(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITHUB_ACTIONS === 'true' || env.CI === 'true'
}

/**
 * True only when Claude Code marks this session attended. Claude Code sets
 * CLAUDE_CODE_SESSION_ATTENDED=1 for an interactive session and 0 for `claude -p` (including a
 * `claude -p` nested in an interactive session), and hook processes inherit it. A missing or
 * changed variable fails safe: no silent merge allow, so the harness prompts. See
 * docs/development/merge-authority.md.
 */
export function isAttendedClaudeSession(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAUDE_CODE_SESSION_ATTENDED === '1'
}

export function preToolUseOutput(payload: HookPayload, options: PreToolUseOptions = {}): string {
  const block = findPreToolUseBlock(payload, {
    automationContext: options.automationContext,
    sessionOwners: options.sessionOwners,
  })
  if (block === null) {
    return ''
  }

  if (block.disposition === 'confirm') {
    return renderConfirmDisposition(options)
  }

  return JSON.stringify({
    decision: options.runtime === 'grok' ? 'deny' : 'block',
    reason: block.reason,
  })
}
