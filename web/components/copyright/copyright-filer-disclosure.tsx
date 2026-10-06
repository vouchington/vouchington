import Link from 'next/link'
import { userHref } from '@/lib/links/entity-href'
import type { ClientAuthUser } from '@/lib/auth/client-auth-user'

/** What the filer's identity looks like on an accepted case, by whether they are signed in. */
export function CopyrightFilerDisclosure({ currentUser }: { currentUser: ClientAuthUser | null }) {
  if (!currentUser)
    return (
      <p className='text-sm text-muted-foreground'>
        You are filing without signing in, so accepted notices show no profile for you. We never
        show the legal name you give in a notice. Your contact details and signature stay private.
      </p>
    )
  return (
    <p className='text-sm text-muted-foreground'>
      We never show the legal name you give in a notice. Signed-in members can see your public
      profile name and a link to your profile on accepted cases. See your{' '}
      <Link
        className='underline'
        href={userHref(currentUser)}
      >
        profile
      </Link>
      . Your contact details and signature stay private.
    </p>
  )
}
