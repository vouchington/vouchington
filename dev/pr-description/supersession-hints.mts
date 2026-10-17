export type PullRequestRefOids = { baseRefOid: string; headRefOid: string }

/**
 * Read from the update-time `gh pr view` JSON the policy already fetched for
 * `parsePullRequestIdentity`. Kept separate from `parsePullRequestIdentity` so that type
 * stays ref-SHA-free — nothing outside package-json diffing needs these fields.
 */
export function parsePullRequestRefOids(json: string): PullRequestRefOids {
  const parsed = JSON.parse(json) as Partial<PullRequestRefOids>
  if (parsed.baseRefOid === undefined || parsed.headRefOid === undefined) {
    throw new Error('gh pr view response missing baseRefOid/headRefOid')
  }
  return { baseRefOid: parsed.baseRefOid, headRefOid: parsed.headRefOid }
}
