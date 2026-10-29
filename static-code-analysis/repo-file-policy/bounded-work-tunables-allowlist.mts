export type WorkTunableAllowEntry = {
  file: string
  ruleId: string
  identifier: string
  value: string
  reason: string
}

export const workTunableAllowlistFile =
  'static-code-analysis/repo-file-policy/bounded-work-tunables-allowlist.mts'

export const workTunableAllowlist: readonly WorkTunableAllowEntry[] = [
  {
    file: 'backend/services/copyright-notices/retention-minimal-purge.mts',
    ruleId: 'bounded-work-literal',
    identifier: 'MAX_PAGE_SIZE',
    value: '50',
    reason:
      'Defensive hard ceiling for the internal purge service. The cleanup caller supplies its page size from the validated data-retention DynamicConfig; the service rejects a larger direct override.',
  },
]
