import type { CommunityMemberVacation } from '@/types/api-responses'

export function moderatorVacationDurationToEndsAt(duration: string): string | null {
  if (duration === 'indefinite') return null
  const ends = new Date()
  ends.setDate(ends.getDate() + parseInt(duration, 10))
  return ends.toISOString()
}

export function initialModeratorVacationDuration(
  vacation: CommunityMemberVacation | null,
  supportedDurations: string[],
): string {
  if (!vacation?.ends_at) return 'indefinite'
  const diffMs = new Date(vacation.ends_at).getTime() - new Date(vacation.starts_at).getTime()
  const duration = String(Math.round(diffMs / (1000 * 60 * 60 * 24)))
  return supportedDurations.includes(duration) ? duration : 'indefinite'
}
