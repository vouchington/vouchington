'use client'

import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'

type EvidenceProps = {
  domain: 'report' | 'vote'
  flagType: string
  details: Record<string, unknown>
}

function count(details: Record<string, unknown>, key: string): number | null {
  const value = details[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function correlatedIps(details: Record<string, unknown>) {
  const value = details.correlated_ips
  if (!Array.isArray(value)) return []
  return value.flatMap(row => {
    if (!row || typeof row !== 'object') return []
    const ip = row.ip_address
    const users = row.distinct_user_count
    if (
      typeof ip !== 'string' ||
      !/^[0-9a-fA-F:.]+$/.test(ip) ||
      (!ip.includes('.') && !ip.includes(':')) ||
      typeof users !== 'number' ||
      !Number.isFinite(users) ||
      users < 0
    )
      return []
    return [{ ip, users }]
  })
}

export function IntegrityFlagEvidence({ domain, flagType, details }: EvidenceProps) {
  const t = useTranslations()
  const locale = useUiLocale()
  const threshold = count(details, 'threshold')
  const windowMinutes = count(details, 'window_minutes')
  const ageDays = count(
    details,
    domain === 'report' ? 'new_account_age_days' : 'young_account_age_days',
  )
  const newAccountCount = count(details, 'new_account_reporter_count')
  const youngVoteCount = count(details, 'young_account_vote_count')
  const ips = domain === 'vote' && flagType === 'ip_correlation' ? correlatedIps(details) : []
  const hasEvidence =
    threshold !== null ||
    windowMinutes !== null ||
    ageDays !== null ||
    (domain === 'report' && newAccountCount !== null) ||
    (domain === 'vote' && flagType === 'velocity_spike' && youngVoteCount !== null) ||
    ips.length > 0

  if (!hasEvidence) return <span aria-hidden='true'>—</span>
  return (
    <div className='space-y-1'>
      {domain === 'report' && newAccountCount !== null && (
        <div>
          {t('extracted.admin.integrityFlagEvidence.newAccountReporters')}:{' '}
          {formatNumber(newAccountCount, locale)}
        </div>
      )}
      {domain === 'vote' && flagType === 'velocity_spike' && youngVoteCount !== null && (
        <div>
          {t('extracted.admin.integrityFlagEvidence.youngAccountVotes')}:{' '}
          {formatNumber(youngVoteCount, locale)}
        </div>
      )}
      {threshold !== null && (
        <div>
          {t('extracted.admin.integrityFlagEvidence.threshold')}: {formatNumber(threshold, locale)}
        </div>
      )}
      {windowMinutes !== null && (
        <div>
          {t('extracted.admin.integrityFlagEvidence.windowMinutes')}:{' '}
          {formatNumber(windowMinutes, locale)}
        </div>
      )}
      {ageDays !== null && (
        <div>
          {t('extracted.admin.integrityFlagEvidence.accountAgeDays')}:{' '}
          {formatNumber(ageDays, locale)}
        </div>
      )}
      {ips.slice(0, 5).map(({ ip, users }) => (
        <div key={ip}>
          {ip} · {t('extracted.admin.integrityFlagEvidence.distinctUsers')}:{' '}
          {formatNumber(users, locale)}
        </div>
      ))}
      {ips.length > 5 && (
        <div>
          {t('extracted.admin.integrityFlagEvidence.moreIps', {
            count: formatNumber(ips.length - 5, locale),
          })}
        </div>
      )}
    </div>
  )
}
