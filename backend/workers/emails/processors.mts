import type { EmailJobsTemplates, EmailSendJobs, EmailTemplateInput } from '@queues/emails/types'

export default function processEmail(
  templates: EmailJobsTemplates,
  templateName: EmailSendJobs,
  input: EmailTemplateInput,
  variables: Record<string, unknown>,
) {
  const fn = templates[templateName]
  if (!fn || typeof fn !== 'function') throw new Error(`Email template ${templateName} not found`)
  if (!input) throw new Error('Email .input is required')
  if (!variables) throw new Error('Email .variables are required')
  return fn(input, variables)
}
