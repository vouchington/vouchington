import { defaultGitProbe, type StackPolicy } from 'vouchington-tooling/command-policy'

export const stackPolicy = {
  baseBranch: 'main',
  remote: 'origin',
  guidance: 'See .agents/skills/stacked-prs/SKILL.md.',
  draftFollowUp: 'the `pr_update` tool of the vouchington-tooling MCP server',
  git: defaultGitProbe,
} satisfies StackPolicy
