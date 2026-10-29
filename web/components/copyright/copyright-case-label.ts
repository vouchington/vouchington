export function copyrightCaseLabel(notice: {
  jurisdiction: string
  received_at: string
  claimant: { display_name: string | null } | null
}): string {
  return `${notice.jurisdiction} · ${notice.received_at.slice(0, 10)} · ${notice.claimant?.display_name?.trim() || 'Claimant unavailable'}`
}
