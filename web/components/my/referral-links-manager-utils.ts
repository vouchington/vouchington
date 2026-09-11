import type { UserReferralLinkWithDetails } from '@/types/api-responses'

export interface ProgramGroup {
  programId: string
  programName: string
  links: UserReferralLinkWithDetails[]
}

export function truncateUrl(url: string, maxLen = 60): string {
  try {
    const { hostname, pathname, search } = new URL(url)
    const short = `${hostname}${pathname}${search}`
    return short.length > maxLen ? `${short.slice(0, maxLen)}…` : short
  } catch {
    return url.length > maxLen ? `${url.slice(0, maxLen)}…` : url
  }
}

export function isActive(link: UserReferralLinkWithDetails): boolean {
  return link.activated_at !== null && link.deactivated_at === null
}

// Amex-unfurled per-card children are lifecycle-managed via their parent and excluded from
// this management list entirely (plan decision: "Exclude children from the management list").
export function isChildLink(link: UserReferralLinkWithDetails): boolean {
  return link.parent_link_id !== null
}

export type UnfurlStatus = 'never' | 'pending' | 'completed' | 'failed'

// `markReferralLinkUnfurlRequested` clears `unfurl_failed_at` but NOT `unfurl_completed_at`,
// and `markReferralLinkUnfurlFailed`/`markReferralLinkUnfurlCompleted` never touch
// `unfurl_requested_at`. So right after a fresh request, a stale `unfurl_completed_at` (or,
// less commonly, a stale `unfurl_failed_at`) from a previous run can still be sitting on the
// row, older than the new `unfurl_requested_at`. Only a completion/failure timestamp at or
// after the current request reflects THIS run's outcome -- anything older is a leftover from
// before and the current run is still in flight.
export function getUnfurlStatus(link: UserReferralLinkWithDetails): UnfurlStatus {
  if (!link.unfurl_requested_at) return 'never'
  const requestedAt = Date.parse(link.unfurl_requested_at)

  const isCurrentOutcome = (timestamp: string | null) =>
    timestamp !== null && Date.parse(timestamp) >= requestedAt

  if (isCurrentOutcome(link.unfurl_failed_at)) return 'failed'
  if (isCurrentOutcome(link.unfurl_completed_at)) return 'completed'
  return 'pending'
}

export function groupByProgram(links: UserReferralLinkWithDetails[]): ProgramGroup[] {
  const map = new Map<string, ProgramGroup>()
  for (const link of links) {
    const existing = map.get(link.referral_program_id)
    if (existing) {
      existing.links.push(link)
    } else {
      map.set(link.referral_program_id, {
        programId: link.referral_program_id,
        programName: link.referral_program_name,
        links: [link],
      })
    }
  }
  return [...map.values()].toSorted((a, b) => a.programName.localeCompare(b.programName))
}
