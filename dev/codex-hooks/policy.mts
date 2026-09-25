import { readFileSync } from 'node:fs'
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
import { hookToolInput } from './policy/hook-payload.mts'
import {
  type PreToolUseOptions,
  renderConfirmDisposition,
} from './policy/pre-tool-use-confirm-output.mts'
import type { HookPayload } from './types.mts'

export type { PreToolUseOptions, PreToolUseRuntime } from './policy/pre-tool-use-confirm-output.mts'

export type { HookPayload } from './types.mts'

export function readHookPayload(stdin = readFileSync(0, 'utf8')): HookPayload {
  if (stdin.trim() === '') {
    return {}
  }

  try {
    return JSON.parse(stdin) as HookPayload
  } catch {
    return {}
  }
}

export function extractToolCommand(payload: HookPayload): string {
  const toolInput = hookToolInput(payload)
  if (toolInput && typeof toolInput.command === 'string') return toolInput.command
  if (typeof payload.command === 'string') return payload.command
  return ''
}

export function findPreToolUseBlock(
  payload: HookPayload,
  options: GitHubWorkflowPolicyOptions = {},
): BlockDecision | null {
  const command = extractToolCommand(payload)
  if (hookPayloadReferencesClairePath(payload, command)) {
    return {
      reason: 'Typo: .claire should be .claude.',
    }
  }
  if (
    (options.automationContext ?? DEFAULT_AUTOMATION_CONTEXT) &&
    hookPayloadReferencesProtectedHookPath(payload, command)
  ) {
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

  return null
}

/**
 * True when this process is running inside GitHub Actions automation, where merge authority is
 * never delegated to an agent. Interactive sessions (Claude or Codex, run by a human) may proceed
 * only through the separate explicit-confirmation path. See docs/development/merge-authority.md.
 */
export function isAutomationContext(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITHUB_ACTIONS === 'true' || env.CI === 'true'
}

export function preToolUseOutput(payload: HookPayload, options: PreToolUseOptions = {}): string {
  const block = findPreToolUseBlock(payload, {
    validateClosingIssueReferences: true,
    automationContext: options.automationContext,
    sessionOwners: options.sessionOwners,
  })
  if (block === null) {
    return ''
  }

  if (block.disposition === 'confirm') {
    return renderConfirmDisposition(block, options)
  }

  return JSON.stringify({
    decision: options.runtime === 'grok' ? 'deny' : 'block',
    reason: block.reason,
  })
}
