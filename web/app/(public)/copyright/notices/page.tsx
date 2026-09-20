import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getCopyrightNotices } from '@/lib/api/server/copyright-notices'
import Link from 'next/link'
export const dynamic = 'force-dynamic'
export default async function CopyrightNoticesPage() {
  await requireCurrentUser()
  const notices = await getCopyrightNotices()
  return (
    <main className='mx-auto max-w-3xl space-y-5 py-8'>
      <h1 className='text-3xl font-bold'>Accepted copyright notices</h1>
      <p className='text-muted-foreground'>
        Case records exclude participant identities, correspondence, evidence, and agent analysis.
      </p>
      <ul className='space-y-3'>
        {notices.map(notice => (
          <li
            key={notice.id}
            className='rounded border p-4'
          >
            <Link
              className='font-medium underline'
              href={`/copyright/notices/${notice.id}`}
            >
              Case {notice.id}
            </Link>
            <p className='text-sm text-muted-foreground'>
              {notice.target_count} affected placement{notice.target_count === 1 ? '' : 's'}.
              Accepted {new Date(notice.accepted_at).toLocaleDateString()}.
            </p>
          </li>
        ))}
      </ul>
    </main>
  )
}
