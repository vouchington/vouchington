'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DismissibleAside } from '@/components/asides/dismissible-aside'
import { DataPw } from '@/components/shared/data-pw'

interface DismissibleCtaAsideProps {
  dismissKey: string
  title: string
  description: string
  href: string
  actionLabel: string
  variant?: 'default' | 'outline'
  'data-pw'?: string
}

export function DismissibleCtaAside({
  dismissKey,
  title,
  description,
  href,
  actionLabel,
  variant = 'default',
  'data-pw': dataPw = 'dismissible-cta-aside',
}: DismissibleCtaAsideProps) {
  return (
    <DismissibleAside dismissKey={dismissKey}>
      <Card
        className='p-4'
        data-pw={dataPw}
      >
        <DataPw
          dataPw={`${dataPw}-heading`}
          className='mb-2 pr-6 text-sm font-semibold'
          as='h3'
        >
          {title}
        </DataPw>
        <p className='mb-3 text-xs text-muted-foreground'>{description}</p>
        <Button
          data-pw='dismissible-cta-aside-action'
          asChild
          size='sm'
          variant={variant}
          className='w-full'
        >
          <Link
            href={href}
            prefetch={false}
          >
            {actionLabel}
          </Link>
        </Button>
      </Card>
    </DismissibleAside>
  )
}
