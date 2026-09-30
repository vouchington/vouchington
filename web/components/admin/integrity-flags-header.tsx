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
import type { IntegrityFlagStatusFilter } from '@ts-shared/utils/moderation-catalogs'

export interface IntegrityFlagsHeaderLabels {
  all: string
  description: string
  flags: string
  penalties: string
  pending: string
  refresh: string
  resolved: string
  status: string
  title: string
}

export interface IntegrityFlagsHeaderProps {
  flagsHref: string
  headingPw: string
  isPending: boolean
  labels: IntegrityFlagsHeaderLabels
  onRefresh: () => void
  onStatusChange: (status: IntegrityFlagStatusFilter) => void
  penaltiesHref: string
  penaltiesPw: string
  selectedStatus: IntegrityFlagStatusFilter
  statusFilterPw?: string
}

export function IntegrityFlagsHeader({
  flagsHref,
  headingPw,
  isPending,
  labels,
  onRefresh,
  onStatusChange,
  penaltiesHref,
  penaltiesPw,
  selectedStatus,
  statusFilterPw,
}: IntegrityFlagsHeaderProps) {
  return (
    <div className='mb-8'>
      <AdminPageHeader
        dataPw={headingPw}
        title={labels.title}
        description={labels.description}
      >
        <ButtonGroup>
          <Button
            asChild
            variant='secondary'
            size='touchSm'
          >
            <Link
              href={flagsHref}
              prefetch={false}
            >
              {labels.flags}
            </Link>
          </Button>
          <Button
            asChild
            variant='outline'
            size='touchSm'
          >
            <Link
              href={penaltiesHref}
              prefetch={false}
              // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- each flags page passes its own literal penalties tab id
              data-pw={penaltiesPw}
            >
              {labels.penalties}
            </Link>
          </Button>
        </ButtonGroup>
        <Select
          value={selectedStatus}
          onValueChange={value => onStatusChange(value as IntegrityFlagStatusFilter)}
        >
          <SelectTrigger
            className='w-36'
            aria-label={labels.status}
            // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- vote passes a literal id; report omits it so a default would add a ghost selector
            data-pw={statusFilterPw}
            disabled={isPending}
          >
            <SelectValue placeholder={labels.pending} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='pending'>{labels.pending}</SelectItem>
            <SelectItem value='resolved'>{labels.resolved}</SelectItem>
            <SelectItem value='all'>{labels.all}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant='outline'
          size='touchIcon'
          onClick={onRefresh}
          aria-label={labels.refresh}
          disabled={isPending}
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
        </Button>
      </AdminPageHeader>
    </div>
  )
}
