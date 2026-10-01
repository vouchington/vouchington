import webCopyrightEmailIntakeInformationRequestNoReply from '../../../../api-fixtures/v1/responses/web.copyright.email-intake-information-request.no-reply.json'
import webCopyrightEmailIntakeInformationRequestReplyQueued from '../../../../api-fixtures/v1/responses/web.copyright.email-intake-information-request.reply-queued.json'
import webCopyrightEmailIntakeRejectionNoReply from '../../../../api-fixtures/v1/responses/web.copyright.email-intake-rejection.no-reply.json'
import webCopyrightEmailIntakeRejectionReplyQueued from '../../../../api-fixtures/v1/responses/web.copyright.email-intake-rejection.reply-queued.json'
import webCopyrightEmailIntakeQueueDefault from '../../../../api-fixtures/v1/responses/web.copyright.email-intake-queue.default.json'
import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

const intakeId = '00000000-0000-7000-8000-000000000840'
const informationRequest = {
  rationale: 'The notice does not identify the allegedly infringing URLs.',
  recommendation_id: null,
  manual_fallback_reason: 'No agent output.',
  response_message: 'Please identify the copyrighted work and each allegedly infringing URL.',
}

export const COPYRIGHT_EMAIL_INTAKE_DECLARATIONS = [
  defineWebApiFixture<CopyrightEmailIntakeQueuePage>()(
    'web.copyright.email-intake-queue.default',
    webCopyrightEmailIntakeQueueDefault,
    context => context.server.copyrightNotices.getCopyrightEmailIntakeReviewQueue(),
    [context => context.client.copyrightEmailIntakes.listCopyrightEmailIntakes()],
  ),
  defineWebApiFixture<{ reply_queued: boolean }>()(
    'web.copyright.email-intake-rejection.reply-queued',
    webCopyrightEmailIntakeRejectionReplyQueued,
    context =>
      context.client.copyrightEmailIntakes.rejectCopyrightEmailIntake(
        intakeId,
        'The message is not a copyright notice.',
        null,
        'No agent output.',
        'reporter@example.test',
      ),
  ),
  defineWebApiFixture<{ reply_queued: boolean }>()(
    'web.copyright.email-intake-rejection.no-reply',
    webCopyrightEmailIntakeRejectionNoReply,
    context =>
      context.client.copyrightEmailIntakes.rejectCopyrightEmailIntake(
        intakeId,
        'The message is not a copyright notice.',
        null,
        'No agent output.',
        null,
      ),
  ),
  defineWebApiFixture<{ reply_queued: boolean }>()(
    'web.copyright.email-intake-information-request.reply-queued',
    webCopyrightEmailIntakeInformationRequestReplyQueued,
    context =>
      context.client.copyrightEmailIntakes.requestCopyrightEmailIntakeInformation(intakeId, {
        ...informationRequest,
        reply_email: 'reporter@example.test',
      }),
  ),
  defineWebApiFixture<{ reply_queued: boolean }>()(
    'web.copyright.email-intake-information-request.no-reply',
    webCopyrightEmailIntakeInformationRequestNoReply,
    context =>
      context.client.copyrightEmailIntakes.requestCopyrightEmailIntakeInformation(intakeId, {
        ...informationRequest,
        reply_email: null,
      }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
