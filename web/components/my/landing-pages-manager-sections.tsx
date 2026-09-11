'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UsernameRequiredDialog } from '@/components/shared/username-required-dialog'
import { useTranslations } from '@/lib/i18n/use-translations'

export function LandingPagesUsernameRequired() {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className='space-y-3 rounded-lg border p-4'>
      <h1
        className='text-2xl font-bold'
        data-pw='landing-pages-required-heading'
      >
        {t('extracted.my.landingPagesManagerSections.landingPages_6e8d0e5d')}
      </h1>
      <p className='text-sm text-muted-foreground'>
        {t('extracted.my.landingPagesManagerSections.aUsernameIsRequiredToCreate_dd12575b')}
      </p>
      <div className='flex items-center gap-3'>
        <Button
          data-pw='landing-pages-choose-username'
          onClick={() => setDialogOpen(true)}
        >
          {t('extracted.my.landingPagesManagerSections.chooseAUsername_a5eec3f7')}
        </Button>
        <Link
          href='/my/identity'
          prefetch={false}
          className='text-sm text-muted-foreground underline-offset-4 hover:underline'
          data-pw='landing-pages-identity-settings-link'
        >
          {t('extracted.my.landingPagesManagerSections.goToIdentitySettings_5a82930e')}
        </Link>
      </div>
      <UsernameRequiredDialog
        open={dialogOpen}
        title={t(
          'extracted.my.landingPagesManagerSections.chooseAUsernameToCreateLanding_1df45daf',
        )}
        description={t(
          'extracted.my.landingPagesManagerSections.aUsernameIsRequiredToPublish_5025eb4e',
        )}
        submitLabel={t('extracted.my.landingPagesManagerSections.createUsername_182e7a51')}
        onUsernameSet={() => {
          setDialogOpen(false)
          refresh()
        }}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}
