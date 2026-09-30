import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export function buildPostClassifierApplicationLifecycleOperations(input: {
  id: string
  postId: string
}) {
  const { id, postId } = input
  return {
    setInvalidAttempts: () =>
      write(sql`/* setInvalidAttemptsPostClassifierApplicationFixture */
        UPDATE post_classifier_applications SET provider_attempts_started = -1
        WHERE post_id = ${postId} AND id = ${id}
      `),
    startProviderAttempt: () =>
      write(sql`/* startPostClassifierApplicationProviderAttempt */
        UPDATE post_classifier_applications
        SET provider_attempts_started = provider_attempts_started + 1
        WHERE post_id = ${postId} AND id = ${id}
      `),
    setSweepEnqueueCount: (count: number) =>
      write(sql`/* setPostClassifierApplicationSweepEnqueueCount */
        UPDATE post_classifier_applications SET sweep_enqueue_count = ${count}
        WHERE post_id = ${postId} AND id = ${id}
      `),
    resetProviderAttempts: () =>
      write(sql`/* resetPostClassifierApplicationProviderAttempts */
        UPDATE post_classifier_applications SET provider_attempts_started = 0
        WHERE post_id = ${postId} AND id = ${id}
      `),
    markTerminalFailure: (kind: string) =>
      write(sql`/* markPostClassifierApplicationTerminalFailure */
        UPDATE post_classifier_applications
        SET terminal_remote_failure_kind = ${kind}, terminal_remote_failed_at = CURRENT_TIMESTAMP
        WHERE post_id = ${postId} AND id = ${id}
      `),
    clearTerminalFailure: () =>
      write(sql`/* clearPostClassifierApplicationTerminalFailure */
        UPDATE post_classifier_applications
        SET terminal_remote_failure_kind = NULL, terminal_remote_failed_at = NULL
        WHERE post_id = ${postId} AND id = ${id}
      `),
    invalidLease: () =>
      write(sql`/* invalidPostClassifierApplicationLease */
        UPDATE post_classifier_applications
        SET lease_token = ${randomUUID()}, leased_at = CURRENT_TIMESTAMP,
          lease_expires_at = CURRENT_TIMESTAMP - interval '1 second'
        WHERE post_id = ${postId} AND id = ${id}
      `),
    lease: (token: string) =>
      write(sql`/* leasePostClassifierApplicationFixture */
        UPDATE post_classifier_applications SET lease_token = ${token},
          leased_at = CURRENT_TIMESTAMP, lease_expires_at = CURRENT_TIMESTAMP + interval '5 minutes'
        WHERE post_id = ${postId} AND id = ${id}
      `),
    persistOutcomes: () =>
      write(sql`/* persistPostClassifierApplicationOutcomes */
        UPDATE post_classifier_applications SET outcomes_persisted_at = CURRENT_TIMESTAMP,
          local_flagged = true, local_reason = 'AI-generated', local_confidence_score = 0.9,
          local_confidence_threshold = 0.8, local_classification = 'ai',
          local_detector = 'test-detector', local_detector_model_version = 'test-v1'
        WHERE post_id = ${postId} AND id = ${id}
      `),
    persistRemoteOutcomes: () =>
      write(sql`/* persistPostClassifierApplicationRemoteOutcomes */
        UPDATE post_classifier_applications SET outcomes_persisted_at = CURRENT_TIMESTAMP
        WHERE post_id = ${postId} AND id = ${id}
      `),
    injectLocalOutcome: () =>
      write(sql`/* injectPostClassifierApplicationLocalOutcome */
        UPDATE post_classifier_applications
        SET local_flagged = true, local_reason = 'late', local_confidence_score = 0.9,
          local_confidence_threshold = 0.8, local_classification = 'ai',
          local_detector = 'test-detector', local_detector_model_version = 'test-v1'
        WHERE post_id = ${postId} AND id = ${id}
      `),
    persistPartialLocalOutcome: () =>
      write(sql`/* persistPartialPostClassifierLocalOutcome */
        UPDATE post_classifier_applications SET local_flagged = true
        WHERE post_id = ${postId} AND id = ${id}
      `),
    mutateLocalOutcome: () =>
      write(sql`/* mutatePostClassifierApplicationLocalOutcome */
        UPDATE post_classifier_applications SET local_flagged = false
        WHERE post_id = ${postId} AND id = ${id}
      `),
    markVotes: () =>
      write(sql`/* markPostClassifierApplicationVotes */
        UPDATE post_classifier_applications SET votes_applied_at = CURRENT_TIMESTAMP
        WHERE post_id = ${postId} AND id = ${id}
      `),
    markTags: () =>
      write(sql`/* markPostClassifierApplicationTags */
        UPDATE post_classifier_applications SET tags_applied_at = CURRENT_TIMESTAMP
        WHERE post_id = ${postId} AND id = ${id}
      `),
    complete: () =>
      write(sql`/* completePostClassifierApplicationFixture */
        UPDATE post_classifier_applications SET completed_at = CURRENT_TIMESTAMP,
          lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
        WHERE post_id = ${postId} AND id = ${id}
      `),
    touch: () =>
      write(sql`/* touchPostClassifierApplicationFixture */
        UPDATE post_classifier_applications
        SET provider_attempts_started = provider_attempts_started
        WHERE post_id = ${postId} AND id = ${id}
      `),
    clearVotes: () =>
      write(sql`/* clearPostClassifierApplicationVotes */
        UPDATE post_classifier_applications SET votes_applied_at = NULL
        WHERE post_id = ${postId} AND id = ${id}
      `),
    deletePost: () =>
      write(sql`/* deletePostClassifierApplicationPost */
        DELETE FROM posts WHERE id = ${postId}
      `),
  }
}
