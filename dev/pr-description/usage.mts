const usage = `Usage:
  node dev/pr-description.mts validate [<pr>] [--body-file <path>]
  node dev/pr-description.mts create --title <title> [--body-file <path>] [--acknowledge-large-diff]
  node dev/pr-description.mts update <pr> [--body-file <path>]

Body source: --body-file > piped stdin > gh pr view (validate/update only)
create refuses over ~5000 changed lines against origin/main; pass --acknowledge-large-diff to
proceed anyway once the split-vs-stack decision has been made (see
.agents/skills/agent-workflow/git-and-prs.md).
`

export function printPrDescriptionUsage(stream: NodeJS.WritableStream): void {
  stream.write(usage)
}
