import type { PrivateUser } from '@services/users/types'
import type { CrmContact, CrmContactSocialAccount } from '@voucha/types/entities/crm-contact'
import {
  runToolLoop,
  buildAgentTools,
  parseLLMJsonResponse,
  DEFAULT_AGENT_MODEL,
  sanitizeAndWrapUserInput,
  SYNCHRONOUS_REQUEST_RETRY_POLICY,
} from '@agents/_shared'
import searchPostsTool from '@voucha/tools/search-posts'
import searchRssFeedItemsTool from '@voucha/tools/search-rss-feed-items'
import { buildCrmOutreachSystemPrompt } from './build-system-prompt.mts'

const MAX_ITERATIONS = 3

export interface DraftCrmOutreachEmailOptions {
  prompt?: string
  tone?: string
  socialAccounts?: CrmContactSocialAccount[]
}

export interface DraftCrmOutreachEmailResult {
  subject: string
  body_html: string
  body_text: string
}

interface DraftCrmOutreachEmailDeps {
  runToolLoop?: typeof runToolLoop
  buildCrmOutreachSystemPrompt?: typeof buildCrmOutreachSystemPrompt
}

export async function draftCrmOutreachEmail(
  currentUser: PrivateUser,
  contact: CrmContact,
  options: DraftCrmOutreachEmailOptions = {},
  deps: DraftCrmOutreachEmailDeps = {},
): Promise<DraftCrmOutreachEmailResult> {
  const buildSystemPrompt = deps.buildCrmOutreachSystemPrompt ?? buildCrmOutreachSystemPrompt
  const runLoop = deps.runToolLoop ?? runToolLoop

  const systemPrompt = await buildSystemPrompt({
    contact,
    socialAccounts: options.socialAccounts,
  })

  const userMessage = await buildUserMessage(contact, options)

  const { agentTools } = buildAgentTools(currentUser, [searchPostsTool, searchRssFeedItemsTool])

  const { text } = await runLoop({
    model: DEFAULT_AGENT_MODEL,
    instructions: systemPrompt,
    tools: agentTools,
    input: userMessage,
    maxIterations: MAX_ITERATIONS,
    safetyIdentifier: currentUser.id,
    agentSlug: 'crm-outreach',
    maxRetries: SYNCHRONOUS_REQUEST_RETRY_POLICY.maxRetries,
    // Latency-sensitive (a staff member is waiting): stays on default tier, no service_tier
    // override. The cache key still lets identical-prefix requests hit cache; note the
    // per-contact block in buildCrmOutreachSystemPrompt sits before the static Task/Guidelines
    // text, so the byte-identical prefix across contacts is short — a real but partial win.
    extraParams: { prompt_cache_key: 'crm-outreach-v1' },
  })

  const rawText = text ?? ''
  try {
    const candidate = parseLLMJsonResponse<{
      subject?: unknown
      body_html?: unknown
      body_text?: unknown
    }>(rawText)
    const subject = typeof candidate.subject === 'string' ? candidate.subject.trim() : ''
    const bodyHtml = typeof candidate.body_html === 'string' ? candidate.body_html.trim() : ''
    const bodyText =
      typeof candidate.body_text === 'string' ? candidate.body_text.trim() : undefined

    if (subject && bodyHtml) {
      return {
        subject,
        body_html: bodyHtml,
        body_text:
          bodyText ??
          bodyHtml
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
      }
    }
  } catch {
    // fall through to HTML-wrap fallback
  }

  const html = `<p>${rawText.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
  return {
    subject: 'Collaboration opportunity with Voucha',
    body_html: html,
    body_text: rawText,
  }
}

async function buildUserMessage(
  contact: CrmContact,
  options: DraftCrmOutreachEmailOptions,
): Promise<string> {
  const parts = ['Please draft an outreach email for the contact from the system context.']

  if (options.prompt) {
    parts.push(
      [
        'Additional instructions:',
        await sanitizeAndWrapUserInput(options.prompt, 'crm_outreach_prompt'),
      ].join('\n'),
    )
  }

  if (options.tone) {
    parts.push(
      ['Tone:', await sanitizeAndWrapUserInput(options.tone, 'crm_outreach_tone')].join('\n'),
    )
  }

  if (!options.prompt && !options.tone) {
    parts.push(
      [
        'Contact name for personalization:',
        await sanitizeAndWrapUserInput(contact.name, 'crm_contact_name', {
          isTitle: true,
          includeReminder: false,
        }),
      ].join('\n'),
    )
  }

  return parts.join('\n\n')
}
