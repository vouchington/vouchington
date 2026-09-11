'use client'

import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { IntegrityPenaltyStatus } from './use-integrity-penalties'

interface IntegrityPenaltiesHeaderProps {
  domain: 'report' | 'vote'
  flagsPath: string
  isPending: boolean
  onRefresh: () => void
  onStatusChange: (status: IntegrityPenaltyStatus) => void
  penaltiesPath: string
  selectedStatus: IntegrityPenaltyStatus
  flagsTestId?: string
  headingTestId?: string
  statusFilterTestId?: string
}

export function IntegrityPenaltiesHeader({
  flagsTestId = 'report-integrity-flags-tab',
  headingTestId = 'report-integrity-penalties-heading',
  statusFilterTestId = 'report-integrity-penalties-status-filter',
  ...props
}: IntegrityPenaltiesHeaderProps) {
  const t = useTranslations()
  const isReport = props.domain === 'report'
  return (
    <AdminPageHeader
      dataPw={headingTestId}
      title={
        isReport
          ? t('extracted.flags.integrityPenalties.reportTitle_6f7f2d01')
          : t('extracted.flags.integrityPenalties.voteTitle_3a621e8c')
      }
      description={t('extracted.flags.integrityPenalties.description_7c9e11ab')}
    >
      <ButtonGroup>
        <Button
          asChild
          variant='outline'
          size='touchSm'
        >
          <Link
            href={props.flagsPath}
            prefetch={false}
            data-pw={flagsTestId}
          >
            {t('extracted.flags.integrityPenalties.flags_81a36f40')}
          </Link>
        </Button>
        <Button
          asChild
          variant='secondary'
          size='touchSm'
        >
          <Link
            href={props.penaltiesPath}
            prefetch={false}
          >
            {t('extracted.flags.integrityPenalties.penalties_f9ca26c7')}
          </Link>
        </Button>
      </ButtonGroup>
      <Select
        value={props.selectedStatus}
        onValueChange={value => props.onStatusChange(value as IntegrityPenaltyStatus)}
      >
        <SelectTrigger
          className='w-36'
          aria-label={t('extracted.flags.integrityPenalties.filterByStatus_bbe02316')}
          data-pw={statusFilterTestId}
          disabled={props.isPending}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='active'>
            {t('extracted.flags.integrityPenalties.active_8bb00d32')}
          </SelectItem>
          <SelectItem value='revoked'>
            {t('extracted.flags.integrityPenalties.revoked_3321829a')}
          </SelectItem>
          <SelectItem value='all'>
            {t('extracted.flags.integrityPenalties.all_a52ace42')}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant='outline'
        size='touchIcon'
        onClick={props.onRefresh}
        aria-label={t('extracted.flags.integrityPenalties.refresh_c8466d9d')}
        disabled={props.isPending}
      >
        <RefreshCw className={`h-4 w-4 ${props.isPending ? 'animate-spin' : ''}`} />
      </Button>
    </AdminPageHeader>
  )
}
