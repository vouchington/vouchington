import type { HookPayload } from '../types.mts'
import { hookToolInput } from '../hook-payload.mts'

export type BlockDecision = {
  reason: string
  /**
   * 'block' (the default when omitted) rejects the tool call outright — both Claude Code and
   * Codex understand `{decision:'block'}`. 'confirm' marks an interactive lone merge, which
   * pre-tool-use-confirm-output.mts renders as a silent allow only in an attended Claude session
   * (see docs/development/merge-authority.md). findInteractiveMergeConfirm in
   * github-merge-authority.mts is the only source of 'confirm', and policy.mts consults it after
   * every block, so a block anywhere in the command always wins.
   */
  disposition?: 'block' | 'confirm'
}
/**
 * Default for `automationContext` when a caller omits it — block (the strict, safe default).
 * Only pre-tool-use.mts computes the real value from process.env; every other layer falls back
 * to this single constant so the merge-branch call sites (github-workflow.mts's inline check and
 * its call into findGhApiMergeBlock, plus findGhApiMergeBlock's own parameter default in
 * github-api-merge-options.mts) can't drift independently.
 */
export const DEFAULT_AUTOMATION_CONTEXT = true
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
export function hookCwd(payload: HookPayload): string {
  const toolInput = hookToolInput(payload)
  if (toolInput) {
    if (typeof toolInput.cwd === 'string') {
      return toolInput.cwd
    }
    if (typeof toolInput.workdir === 'string') {
      return toolInput.workdir
    }
  }

  if (typeof payload.cwd === 'string') {
    return payload.cwd
  }
  if (typeof payload.workspaceRoot === 'string') {
    return payload.workspaceRoot
  }

  return process.cwd()
}
