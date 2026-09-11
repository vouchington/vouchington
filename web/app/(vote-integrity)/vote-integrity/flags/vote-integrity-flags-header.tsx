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
import type { StatusFilter } from '@/types/vote-integrity'
import { useTranslations } from '@/lib/i18n/use-translations'

interface VoteIntegrityFlagsHeaderProps {
  isPending: boolean
  onRefresh: () => void
  onStatusChange: (status: StatusFilter) => void
  selectedStatus: StatusFilter
}

export function VoteIntegrityFlagsHeader(props: VoteIntegrityFlagsHeaderProps) {
  const t = useTranslations()
  return (
    <div className='mb-8'>
      <AdminPageHeader
        dataPw='vote-integrity-flags-heading'
        title={t('extracted.flags.voteIntegrityFlagsHeader.voteIntegrityFlags_1917e940')}
        description={t(
          'extracted.flags.voteIntegrityFlagsHeader.reviewAndResolveSuspiciousVotingPatterns_5d176e8e',
        )}
      >
        <ButtonGroup>
          <Button
            asChild
            variant='secondary'
            size='touchSm'
          >
            <Link
              href='/vote-integrity/flags'
              prefetch={false}
            >
              {t('extracted.flags.integrityPenalties.flags_81a36f40')}
            </Link>
          </Button>
          <Button
            asChild
            variant='outline'
            size='touchSm'
          >
            <Link
              href='/vote-integrity/penalties'
              prefetch={false}
              data-pw='vote-integrity-penalties-tab'
            >
              {t('extracted.flags.integrityPenalties.penalties_f9ca26c7')}
            </Link>
          </Button>
        </ButtonGroup>
        <Select
          value={props.selectedStatus}
          onValueChange={value => props.onStatusChange(value as StatusFilter)}
        >
          <SelectTrigger
            className='w-36'
            aria-label={t('extracted.flags.voteIntegrityFlagsHeader.filterFlagsByStatus_dc937672')}
            data-pw='vote-integrity-flags-status-filter'
            disabled={props.isPending}
          >
            <SelectValue
              placeholder={t('extracted.flags.voteIntegrityFlagsHeader.pending_331551b0')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='pending'>
              {t('extracted.flags.voteIntegrityFlagsHeader.pending_331551b0')}
            </SelectItem>
            <SelectItem value='resolved'>
              {t('extracted.flags.voteIntegrityFlagsHeader.resolved_5be3c2c8')}
            </SelectItem>
            <SelectItem value='all'>
              {t('extracted.flags.voteIntegrityFlagsHeader.all_a52ace42')}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant='outline'
          size='touchIcon'
          onClick={props.onRefresh}
          aria-label={t('extracted.flags.voteIntegrityFlagsHeader.refreshFlags_2bf69363')}
          disabled={props.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${props.isPending ? 'animate-spin' : ''}`} />
        </Button>
      </AdminPageHeader>
    </div>
  )
}
