'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { buildLoginHref } from '@/lib/auth/login-url'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CommentSignInPrompt() {
  const t = useTranslations()
  const pathname = usePathname()
  const loginHref = buildLoginHref({ next: pathname ?? undefined, intent: 'comment' })

  return (
    <div className='rounded-md border bg-muted/50 p-4 text-sm text-muted-foreground'>
      <Link
        prefetch={false}
        href={loginHref}
        className='font-medium text-foreground underline underline-offset-2'
        data-pw='comment-sign-in-link'
      >
        {t('extracted.comments.commentSignInPrompt.signIn_bfd402b2')}
      </Link>{' '}
      {t('extracted.comments.commentSignInPrompt.toComment_e9ff581c')}
    </div>
  )
}
