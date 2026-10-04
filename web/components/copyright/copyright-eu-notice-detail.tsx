import Link from 'next/link'
import type { CopyrightParticipantNoticeDetail } from '@/types/copyright-notices'
import { CopyrightNoticeStatements } from './copyright-notice-statements'

export function CopyrightEuNoticeDetail({
  notice,
}: {
  notice: Extract<CopyrightParticipantNoticeDetail, { jurisdiction: 'eu_dsa' }>
}) {
  const eu = notice.eu
  return (
    <section
      className='space-y-5'
      data-pw='copyright-eu-notice-detail'
    >
      <div>
        <p className='text-sm text-muted-foreground'>Case {notice.id}</p>
        <h1 className='text-3xl font-bold'>EU copyright notice</h1>
        <p>Received {new Date(notice.received_at).toLocaleDateString()}</p>
      </div>
      <section className='space-y-2'>
        <h2 className='text-lg font-semibold'>Decision</h2>
        {eu.reopened_at ? (
          <p>Your complaint was upheld. Staff are deciding this notice again.</p>
        ) : eu.outcome === null ? (
          <p>A moderator is reviewing this notice.</p>
        ) : (
          <p>
            {eu.outcome === 'restrict'
              ? 'The hosted material was restricted.'
              : 'No action was taken.'}
          </p>
        )}
        {eu.decided_at && <p>Decided {new Date(eu.decided_at).toLocaleDateString()}</p>}
      </section>
      {notice.targets.length > 0 && (
        <section className='space-y-2'>
          <h2 className='text-lg font-semibold'>Affected hosted material</h2>
          <ul className='space-y-2'>
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
                <p>Status: {target.restriction_status}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CopyrightNoticeStatements statements={notice.statements} />
      <section className='space-y-2'>
        <h2 className='text-lg font-semibold'>Your complaint</h2>
        {eu.complaint.request ? (
          <p>Your complaint has been received.</p>
        ) : eu.outcome === null ? (
          <p>You can complain after a decision is made.</p>
        ) : eu.reopened_at ? (
          <p>A new complaint will be available after staff make a new decision.</p>
        ) : eu.complaint.can_submit ? (
          <Link
            className='underline'
            href={`/copyright/notices/${notice.id}/complaint`}
          >
            Complain about this decision
          </Link>
        ) : (
          <p>A complaint cannot be submitted for this decision.</p>
        )}
        {eu.complaint.window_ends_at && (
          <p>Complaint period ends {new Date(eu.complaint.window_ends_at).toLocaleDateString()}.</p>
        )}
        {eu.complaint.decision && (
          <div>
            <p>
              {eu.complaint.decision.staff_disposition === 'revoke'
                ? 'Your complaint was upheld.'
                : 'The original decision was maintained.'}
            </p>
            <p className='whitespace-pre-wrap'>{eu.complaint.decision.rationale}</p>
          </div>
        )}
      </section>
      <section className='space-y-2'>
        <h2 className='text-lg font-semibold'>Other redress routes</h2>
        <p>
          You may refer the dispute to a certified out-of-court dispute settlement body under DSA
          Article 21. You may also seek judicial redress.
        </p>
      </section>
      <section className='space-y-2'>
        <h2 className='text-lg font-semibold'>Dispute settlements</h2>
        {eu.dispute_settlements.length === 0 ? (
          <p>No dispute settlement has been recorded.</p>
        ) : (
          <ul className='space-y-3'>
            {eu.dispute_settlements.map(referral => (
              <li
                key={referral.id}
                className='rounded border p-3'
              >
                <p>{referral.body_name}</p>
                <p>Referred {new Date(referral.referred_at).toLocaleDateString()}</p>
                {referral.outcome ? (
                  <div>
                    <p>Outcome: {referral.outcome.result.replaceAll('_', ' ')}</p>
                    <p>Decided {new Date(referral.outcome.decided_at).toLocaleDateString()}</p>
                    {referral.outcome.implemented_at && (
                      <p>
                        Implemented {new Date(referral.outcome.implemented_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <p>No outcome has been recorded.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
