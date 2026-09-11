import type { CrmContact, CrmContactSocialAccount } from '@voucha/types/entities/crm-contact'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'

interface ContactContext {
  contact: CrmContact
  socialAccounts?: CrmContactSocialAccount[]
}

export async function buildCrmOutreachSystemPrompt(ctx: ContactContext): Promise<string> {
  const { contact, socialAccounts } = ctx

  const [sanitizedName, sanitizedEmail, sanitizedVertical] = await Promise.all([
    sanitizePromptInjection(contact.name, { isTitle: true }),
    sanitizePromptInjection(contact.email),
    contact.vertical ? sanitizePromptInjection(contact.vertical) : Promise.resolve('unknown'),
  ])

  const socialLines =
    socialAccounts && socialAccounts.length > 0
      ? (
          await Promise.all(
            socialAccounts.map(async a => {
              const sanitizedHandle = await sanitizePromptInjection(a.handle, { isTitle: true })
              const handle = sanitizedHandle.startsWith('@')
                ? sanitizedHandle
                : `@${sanitizedHandle}`
              return `- ${a.platform}: ${handle}${a.follower_count ? ` (${a.follower_count.toLocaleString()} followers)` : ''}`
            }),
          )
        ).join('\n')
      : '(none on file)'

  const contactData = [
    `Name: ${sanitizedName}`,
    `Email: ${sanitizedEmail}`,
    `Vertical: ${sanitizedVertical}`,
    `Follower count: ${contact.follower_count?.toLocaleString() ?? 'unknown'}`,
    `Social accounts:\n${socialLines}`,
  ].join('\n')

  const wrappedContactData = wrapExternalContent(contactData, {
    source: 'user_message',
    contentType: 'contact-profile',
  })

  return `You are an outreach specialist at Voucha, a platform for travel and financial rewards content.
You help draft personalized outreach emails to influencers and content creators.

## Contact Details
${wrappedContactData}

## Your Task
Draft a personalized outreach email to this contact. Use the available tools to:
1. Search for recent Voucha posts or articles relevant to their content vertical
2. Search for RSS feed items about topics in their niche

Incorporate relevant content into the email to make it feel personalized and valuable.

## Guidelines
- Be personable, concise, and genuine — avoid sounding like a template
- Highlight specific value Voucha offers for their audience vertical
- Keep the email under 200 words
- Do not use placeholder text or generic phrases like "[insert name]"
- Reference specific content or topics relevant to their niche when possible

## Output Format
Respond with ONLY a JSON object — no prose, no markdown, no code fences, no preamble:
{"subject":"Email subject line","body_html":"<p>HTML email body content</p>","body_text":"Plain text version of the email body"}`
}
