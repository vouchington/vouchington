import Link from 'next/link'
import type {
  CopyrightNoticeDetail,
  CopyrightNoticeResponseEligibility,
} from '@/types/copyright-notices'

export function CopyrightNoticeDetailView({
  notice,
  responseEligibility,
}: {
  notice: CopyrightNoticeDetail
  responseEligibility: CopyrightNoticeResponseEligibility | null
}) {
  return (
    <section className='space-y-5'>
      <div>
        <p className='text-sm text-muted-foreground'>Case {notice.id}</p>
        <h1 className='text-3xl font-bold'>Copyright notice</h1>
        <p className='text-sm text-muted-foreground'>
          Accepted {new Date(notice.accepted_at).toLocaleDateString()}
        </p>
      </div>
      <section>
        <h2 className='text-lg font-semibold'>Affected hosted material</h2>
        <ul className='mt-2 space-y-2'>
          {notice.targets.map(target => (
            <li
              key={target.id}
              className='rounded border p-3'
            >
              {target.hosted_use_url ? (
                <a
                  href={target.hosted_use_url}
                  className='underline'
                >
                  {target.hosted_use_url}
                </a>
              ) : (
                <p>Hosted material is not visible to this viewer.</p>
              )}
              <p className='text-sm text-muted-foreground'>Status: {target.restriction_status}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className='text-lg font-semibold'>Case timeline</h2>
        <ol className='mt-2 space-y-2'>
          {notice.timeline.map(event => (
            <li
              key={event.id}
              className='text-sm'
            >
              {event.event_type.replaceAll('_', ' ')}. {new Date(event.created_at).toLocaleString()}
            </li>
          ))}
        </ol>
      </section>
      {responseEligibility?.viewer_role === 'poster' &&
        responseEligibility.respondable_target_ids.length > 0 && (
          <div className='flex gap-3'>
            <Link
              className='underline'
              href={`/copyright/notices/${notice.id}/appeal`}
            >
              Appeal
            </Link>
            <Link
              className='underline'
              href={`/copyright/notices/${notice.id}/counter-notice`}
            >
              Counter-notice
            </Link>
          </div>
        )}
    </section>
  )
}
