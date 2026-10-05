import { getPaginationLimitsForContract } from '@services/pagination'
import assert from 'http-assert'
import { assertNotSuspended } from '@services/users'
import {
  getCopyrightParticipantNoticeDetail,
  getCopyrightStaffEmailIntake,
} from '@services/copyright-notices'
import {
  copyrightEmailIntakeQueueParser,
  listCopyrightStaffEmailIntakePage,
} from '@services/copyright-notices/copyright-email-intake-page'
import {
  copyrightGuestCapabilitiesParser,
  listCopyrightGuestCapabilityPage,
} from '@services/copyright-notices/guest-capability-page'
import { adminInput, createAdminTool, PAGE_INPUT, UUID_INPUT } from './create-admin-tool.mts'
import { redactCopyrightContactFields, redactCopyrightEmailIntake } from './copyright-redaction.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const emailIntakesApi = {
  method: 'GET',
  path: '/api/v1/copyright-email-intakes/review-queue',
} as const
const emailIntakes = createAdminTool<{ after?: string; limit?: number }>({
  name: 'list_copyright_email_intakes',
  description: 'List email intakes awaiting copyright staff review with an opaque cursor.',
  scope: 'copyright-notices:read',
  api: emailIntakesApi,
  parameters: adminInput(PAGE_INPUT),
  outputSchema: adminRouteOutputSchema(emailIntakesApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) =>
    redactCopyrightContactFields(
      await listCopyrightStaffEmailIntakePage(
        user,
        copyrightEmailIntakeQueueParser.parse(
          args,
          getPaginationLimitsForContract(copyrightEmailIntakeQueueParser.queryContract),
        ),
      ),
    ),
})

const emailIntakeApi = { method: 'GET', path: '/api/v1/copyright-email-intakes/:id' } as const
const emailIntake = createAdminTool<{ id: string }>({
  name: 'get_copyright_email_intake',
  description: 'Read structured email-intake review facts without raw email or parser details.',
  scope: 'copyright-notices:read',
  api: emailIntakeApi,
  parameters: adminInput({ id: UUID_INPUT }, ['id']),
  outputSchema: {
    type: 'object',
    properties: {
      copyright_email_intake: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          received_at: { type: 'string', format: 'date-time' },
          review_path: { type: 'string', enum: ['initial', 'unresolved_thread', 'matched_thread'] },
          linked_notice: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  targets: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        placement_key: { type: 'string' },
                      },
                      required: ['id', 'placement_key'],
                    },
                  },
                },
                required: ['id', 'targets'],
              },
              { type: 'null' },
            ],
          },
          ses_verdicts: {
            type: 'object',
            properties: Object.fromEntries(
              ['spf', 'dkim', 'dmarc', 'spam', 'virus'].map(key => [key, { type: 'string' }]),
            ),
            required: ['spf', 'dkim', 'dmarc', 'spam', 'virus'],
          },
          recommendation: {
            anyOf: [
              {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  structured_output: { type: 'object', additionalProperties: true },
                },
                required: ['id', 'structured_output'],
              },
              { type: 'null' },
            ],
          },
        },
        required: [
          'id',
          'received_at',
          'review_path',
          'linked_notice',
          'ses_verdicts',
          'recommendation',
        ],
      },
    },
    required: ['copyright_email_intake'],
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    const intake = await getCopyrightStaffEmailIntake(args.id, user)
    assert(intake, 404, 'Copyright email intake not found')
    return redactCopyrightContactFields({
      copyright_email_intake: redactCopyrightEmailIntake(intake),
    })
  },
})

const capabilitiesApi = {
  method: 'GET',
  path: '/api/v1/copyright-notices/:id/guest-capabilities',
} as const
const capabilities = createAdminTool<{ id: string; after?: string; limit?: number }>({
  name: 'list_copyright_guest_capabilities',
  description: 'List a case’s guest capabilities without revealing access tokens.',
  scope: 'copyright-notices:read',
  api: capabilitiesApi,
  parameters: adminInput({ id: UUID_INPUT, ...PAGE_INPUT }, ['id']),
  outputSchema: adminRouteOutputSchema(capabilitiesApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: (user, args) => {
    assertNotSuspended(user)
    return listCopyrightGuestCapabilityPage(
      user,
      args.id,
      copyrightGuestCapabilitiesParser.parse(
        args,
        getPaginationLimitsForContract(copyrightGuestCapabilitiesParser.queryContract),
      ),
    )
  },
})

const caseApi = { method: 'GET', path: '/api/v1/copyright-notices/:id/participant' } as const
const staffCase = createAdminTool<{ id: string }>({
  name: 'get_copyright_case',
  description:
    'Read the participant case detail, including staff-visible submissions and timeline.',
  scope: 'copyright-notices:read',
  api: caseApi,
  parameters: adminInput({ id: UUID_INPUT }, ['id']),
  outputSchema: adminRouteOutputSchema(caseApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (user, args) => {
    const copyright_notice = await getCopyrightParticipantNoticeDetail(args.id, user)
    assert(copyright_notice, 403, 'You are not a participant in this copyright notice')
    return redactCopyrightContactFields({ copyright_notice })
  },
})

export const adminCopyrightReadTools = [emailIntakes, emailIntake, capabilities, staffCase]
