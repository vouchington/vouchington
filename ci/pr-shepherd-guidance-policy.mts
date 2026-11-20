// pr-shepherd is a per-machine CLI on PATH, not a repo dependency. Checked-in docs and
// skills must invoke plain `pr-shepherd` (never `pnpm exec`, `pnpm`, or `npx`) and no retired
// (pre-v1) subcommands, flags, or action names. The static repository-policy script supplies
// the live files.

export const DEPRECATED_INVOCATIONS =
  /\b(?:pnpm exec )?pr-shepherd\s+(?:poll|resolve|journal(?!\s+extract(?:\s|$))|commit-suggestion|build-suggestion-patch(?:es)?|mark-files-as-viewed|log-file|clean)\b|\bpr-shepherd(?:[ \t]+(?:iterate|<[^>\s]+>|\d+))?[ \t]+--(?:stack|poll-mode)\b|\b(?:FIX_CODE|fix_code|fix-thrash|fix-code-loop)\b/u
const PACKAGE_RUNNER_COMMAND =
  /\b(?:pnpm(?:[ \t]+exec)?|npx)(?:[ \t]+-{1,2}[\w-]+(?:=\S+)?)*[ \t]+pr-shepherd\b/u

export function prShepherdGuidanceViolations(
  files: readonly { path: string; text: string }[],
): string[] {
  const violations: string[] = []
  for (const file of files) {
    if (PACKAGE_RUNNER_COMMAND.test(file.text)) {
      violations.push(`${file.path}: package-runner pr-shepherd command`)
    }
    if (DEPRECATED_INVOCATIONS.test(file.text)) {
      violations.push(`${file.path}: deprecated pr-shepherd invocation`)
    }
  }

  return violations
}
