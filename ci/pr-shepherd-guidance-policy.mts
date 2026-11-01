// #7180: a global pr-shepherd shadowed the workspace install on PATH. Checked-in docs and
// skills must invoke the workspace-pinned CLI and no retired (pre-v1) subcommands, flags,
// or action names. The static repository-policy script supplies the live files.

export const TRUSTED_HOST_SHEPHERD_PROMPT = 'docs/prompts/automation/shepherd.md'
export const REVISIT_FOLLOWUPS_SKILL = '.agents/skills/revisit-followups/SKILL.md'
export const WORKSPACE_JOURNAL_EXTRACT_COMMAND =
  'pnpm exec pr-shepherd journal extract --body-file <path>'

export const DEPRECATED_INVOCATIONS =
  /\b(?:pnpm exec )?pr-shepherd\s+(?:poll|resolve|journal(?!\s+extract(?:\s|$))|commit-suggestion|build-suggestion-patch(?:es)?|mark-files-as-viewed|log-file|clean)\b|\bpr-shepherd(?:[ \t]+(?:iterate|<[^>\s]+>|\d+))?[ \t]+--(?:stack|poll-mode)\b|\b(?:FIX_CODE|fix_code|fix-thrash|fix-code-loop)\b/u
const BARE_LOCAL_COMMAND =
  /`pr-shepherd\s+(?:iterate|apply|journal|suggest|stack|admin|<(?:pr|N|pr-number)>|\d+)(?:\s+[^`\n]+)?`|```(?:bash|sh|zsh|shell)?\n(?:(?!```)[^\n]*\n)*? {0,3}pr-shepherd\s+(?:iterate|apply|journal|suggest|stack|admin|<(?:pr|N|pr-number)>|\d+)(?:\s+[^\n]+)?(?=\n|$)/u

export function prShepherdGuidanceViolations(
  files: readonly { path: string; text: string }[],
): string[] {
  const violations: string[] = []
  const revisit = files.find(file => file.path === REVISIT_FOLLOWUPS_SKILL)
  if (revisit === undefined || !revisit.text.includes(WORKSPACE_JOURNAL_EXTRACT_COMMAND)) {
    violations.push(`${REVISIT_FOLLOWUPS_SKILL}: missing workspace journal extract command`)
  }

  for (const file of files) {
    if (file.path !== TRUSTED_HOST_SHEPHERD_PROMPT && BARE_LOCAL_COMMAND.test(file.text)) {
      violations.push(`${file.path}: bare local pr-shepherd command`)
    }
    if (DEPRECATED_INVOCATIONS.test(file.text)) {
      violations.push(`${file.path}: deprecated pr-shepherd invocation`)
    }
  }

  return violations
}
