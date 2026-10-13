import Link from 'next/link'
import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { UserBioCopy } from '@/components/users/user-bio-copy'

interface PublicLandingPageHeaderProps {
  canonicalHref: string
  displayName: string
  profileImagePath: string | null
  subtitle?: string | null
  title: string
  userMarkdown?: string | null
  detectedLanguage?: string | null
  username?: string | null
}

export function PublicLandingPageHeader({
  canonicalHref,
  displayName,
  profileImagePath,
  subtitle,
  title,
  userMarkdown,
  detectedLanguage,
  username,
}: PublicLandingPageHeaderProps) {
  return (
    <section className='rounded-2xl border border-border bg-card p-6 shadow-sm sm:rounded-3xl sm:p-8'>
      <div className='flex flex-col items-center gap-4 text-center'>
        {profileImagePath ? (
          <Image
            src={profileImagePath}
            alt={displayName}
            width={112}
            height={112}
            className='rounded-full object-cover'
            priority
            unoptimized
          />
        ) : null}
        <div className='space-y-2'>
          <p className='text-sm font-medium text-muted-foreground'>@{username}</p>
          <h1
            data-pw='landing-page-title'
            className='text-3xl break-words font-bold tracking-tight sm:text-4xl'
          >
            <Link
              href={canonicalHref}
              prefetch={false}
              className='hover:underline focus-visible:underline'
            >
              {title}
            </Link>
          </h1>
          <p className='text-lg font-medium text-foreground'>{displayName}</p>
          {subtitle ? <p className='text-base text-muted-foreground'>{subtitle}</p> : null}
        </div>
        {userMarkdown ? (
          <UserBioCopy
            markdown={userMarkdown}
            detectedLanguage={detectedLanguage}
            className='max-w-2xl text-sm text-muted-foreground'
          />
        ) : null}
      </div>
    </section>
  )
}
