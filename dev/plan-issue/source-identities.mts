const GITHUB_SOURCE_URL_RE =
  /(?<![\w])https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)(?:\?[\w%=&+.-]*)?(?:#(?:issuecomment-\d+|discussion_r\d+|discussion-diff-\d+))?(?=$|[\s),.;])/gi
const ISSUE_REFERENCE_RE = /(?<![\w/])(?:([\w.-]+)\/([\w.-]+))?#(\d+)\b/g

export type SolvesIdentities = {
  references: string[]
  sources: string[]
}

export function parseSolvesIdentities(text: string): SolvesIdentities {
  const references = [...text.matchAll(ISSUE_REFERENCE_RE)].map(match =>
    match[1] && match[2]
      ? `${match[1].toLowerCase()}/${match[2].toLowerCase()}#${match[3]}`
      : `#${match[3]}`,
  )
  const sources = [...text.matchAll(GITHUB_SOURCE_URL_RE)].map(
    match => `${match[1].toLowerCase()}/${match[2].toLowerCase()}#${match[3]}`,
  )
  return { references, sources }
}

function referenceMatchesSource(
  reference: string,
  source: string,
  targetRepository?: string,
): boolean {
  if (!reference.startsWith('#'))
    return (
      source === reference &&
      (targetRepository === undefined || reference.startsWith(`${targetRepository.toLowerCase()}#`))
    )
  return targetRepository !== undefined
    ? source === `${targetRepository.toLowerCase()}${reference}`
    : source.endsWith(reference)
}

export function solvesIdentitiesMatch(
  { references, sources }: SolvesIdentities,
  targetRepository?: string,
): boolean {
  const uniqueReferences = [...new Set(references)]
  const uniqueSources = [...new Set(sources)]
  return (
    uniqueReferences.length === uniqueSources.length &&
    uniqueReferences.every(reference =>
      uniqueSources.some(source => referenceMatchesSource(reference, source, targetRepository)),
    ) &&
    uniqueSources.every(source =>
      uniqueReferences.some(reference =>
        referenceMatchesSource(reference, source, targetRepository),
      ),
    )
  )
}
