import assert from 'http-assert'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import { associateCopyrightEmailIntakeWithNotice } from '@services/copyright-notices/email-manual-association'
import { adminInput, createAdminTool, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const associationPath = '/api/v1/copyright-email-intakes/:id/notice-associations'
const api = { method: 'POST', path: associationPath } as const

export const copyrightIntakeAssociationTool = createAdminTool<{
  intake_id: string
  copyright_notice_id: string
}>({
  name: 'associate_copyright_email_intake_with_notice',
  description: 'Associate one unresolved copyright email intake with an existing notice.',
  scope: 'copyright-notices:write',
  switch: 'copyright.mcpDecisionTools',
  api,
  parameters: adminInput({ intake_id: UUID_INPUT, copyright_notice_id: UUID_INPUT }, [
    'intake_id',
    'copyright_notice_id',
  ]),
  outputSchema: adminRouteOutputSchema(api),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  run: (user, args) => {
    const error = RuntimeRequestValidatorRegistry.shared.validateAuthenticated(
      `POST:${associationPath}`,
      {
        path: { id: args.intake_id },
        body: { copyright_notice_id: args.copyright_notice_id },
      },
    )
    assert(!error, 422, error?.message ?? 'Invalid copyright decision request')
    return associateCopyrightEmailIntakeWithNotice(user, args.intake_id, args.copyright_notice_id)
  },
})
