import {
  defineHookPolicy,
  standardGitPatterns,
  type CommandPolicy,
} from 'vouchington-tooling/command-policy'
import { renderPostToolReminder } from '../tmux-reminder-post-tool.mts'
import {
  blockedDevServerPatterns,
  blockedHookBypassPatterns,
} from './policy/blocked-command-patterns.mts'
import {
  PROTECTED_HOOK_DIR_PREFIXES,
  PROTECTED_HOOK_EXACT_FILES,
} from './policy/protected-hook-paths.mts'
import { stackPolicy } from './policy/stack-policy.mts'
import { productPostToolUseCheckers } from './post-tool-use-checkers.mts'

const command: CommandPolicy = {
  typoPaths: [{ segment: '.claire', reason: 'Typo: .claire should be .claude.' }],
  protectedPaths: {
    dirPrefixes: PROTECTED_HOOK_DIR_PREFIXES,
    exactFiles: PROTECTED_HOOK_EXACT_FILES,
    reason:
      'Cannot Edit/Write/apply_patch the permission-enforcement hooks (dev/codex-hooks/**, ' +
      'dev/agent-policy.mts, dev/agent-policy/**, dev/pr-description/**) or execpolicy ' +
      'configuration (.codex/config.toml, .codex/rules/**, .cursor/*.json) during an autonomous ' +
      'run. This closes the mid-session self-mutation gap: a dispatched session could otherwise ' +
      'weaken the hook before a later merge command. Interactive sessions are unaffected.',
  },
  commandPatterns: [...blockedHookBypassPatterns, ...blockedDevServerPatterns],
  gitPatterns: standardGitPatterns({
    pullRebase: 'Use "./dev/rebase-onto-main"; git pull --rebase and git pull -r are banned.',
  }),
  rebaseContinueReason:
    'Use "GIT_EDITOR=true git rebase --continue" so rebase continuation stays noninteractive.',
  mergeGuidance: 'See docs/development/merge-authority.md.',
  stack: stackPolicy,
}

export default defineHookPolicy({
  command,
  checkers: productPostToolUseCheckers,
  reminder: ({ payload }) => renderPostToolReminder(payload),
})
