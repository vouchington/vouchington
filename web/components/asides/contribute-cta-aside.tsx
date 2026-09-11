import Link from 'next/link'
import type { MessageKey } from '@ts-shared/ui-messages'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'

export async function ContributeCtaAside() {
  const t = await getTranslations()
  const user = await getCurrentUser()
  if (!user) return null
  /* c8 ignore next -- icon aliases are covered by Vitest; selected browser coverage does not visit this aside */
  const contributionLinks: Array<{
    href: string
    label: MessageKey
    description: MessageKey
    icon: (typeof EntityActionIcons)[keyof typeof EntityActionIcons]
  }> = [
    {
      href: '/reviews/create',
      label: 'extracted.asides.contributeCtaAside.writeAReview_136286bc',
      description: 'extracted.asides.contributeCtaAside.rateAProductOrService_b2b2c0ca',
      icon: EntityActionIcons.writeReview,
    },
    {
      href: '/discussions/create',
      label: 'extracted.asides.contributeCtaAside.startADiscussion_7373febf',
      description: 'extracted.asides.contributeCtaAside.askQuestionsOrShareThoughts_6f0a9e9f',
      icon: EntityActionIcons.startDiscussion,
    },
    {
      href: '/data-points/create',
      label: 'extracted.asides.contributeCtaAside.addADataPoint_9ef13d31',
      description: 'extracted.asides.contributeCtaAside.shareASpecificFactOrMetric_1684a6e7',
      icon: EntityActionIcons.shareDataPoint,
    },
  ]

  return (
    <Card className='p-4'>
      <h3 className='mb-3 text-sm font-semibold'>
        {t('extracted.asides.contributeCtaAside.shareYourExperience_7afc4ab5')}
      </h3>
      <ul className='space-y-1'>
        {contributionLinks.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Button
              asChild
              variant='ghost'
              className='h-auto w-full justify-start px-2 py-2'
            >
              <Link
                href={href}
                prefetch={false}
              >
                <Icon
                  data-icon='inline-start'
                  className='text-primary'
                />
                <div className='text-left'>
                  <p className='text-sm font-medium'>{t(label)}</p>
                  <p className='text-xs text-muted-foreground'>{t(description)}</p>
                </div>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
