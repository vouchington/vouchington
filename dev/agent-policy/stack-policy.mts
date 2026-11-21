import { defaultGitProbe, type StackPolicy } from 'vouchington-tooling/command-policy'

export const stackPolicy = {
  baseBranch: 'main',
  remote: 'origin',
  guidance: 'Use `gh stack` and shepherd it with `pr-shepherd stack`.',
  draftFollowUp: 'the `pr_update` tool of the vouchington-tooling MCP server',
  git: defaultGitProbe,
} satisfies StackPolicy
