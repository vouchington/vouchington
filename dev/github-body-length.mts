import { validateGitHubBodyLength } from 'vouchington-tooling/gh-cli'

function formatCount(count: number): string {
  return count.toLocaleString('en-US')
}

export function githubBodyLengthError(body: string): string | undefined {
  const validation = validateGitHubBodyLength(body)
  if (validation.ok) return undefined

  return `GitHub body is ${formatCount(validation.characterCount)} Unicode characters (${formatCount(validation.utf8ByteCount)} UTF-8 bytes); GitHub allows at most ${formatCount(validation.maxCharacterCount)} Unicode characters. Save the complete body before editing, preserve required content, and retry only after moving supporting detail to a linked issue or attachment, removing duplicate prose, or compacting only harmless Markdown whitespace; this helper never truncates, normalizes, or compacts content automatically.`
}
