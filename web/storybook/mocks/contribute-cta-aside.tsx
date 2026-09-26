'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { useTranslations } from '@/lib/i18n/use-translations'

const links = [
  { href: '/reviews/create', label: 'Write a review' },
  { href: '/discussions/create', label: 'Start a discussion' },
  { href: '/data-points/create', label: 'Add a data point' },
] as const

export function ContributeCtaAside() {
  const t = useTranslations()
  return (
    <Card className='p-4'>
      <h3 className='mb-3 text-sm font-semibold'>
        {t('extracted.asides.contributeCtaAside.shareYourExperience_7afc4ab5')}
      </h3>
      <ul className='space-y-1'>
        {links.map(link => (
          <li key={link.href}>
            <Link
              href={link.href}
              prefetch={false}
              className='text-sm text-primary hover:underline'
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
