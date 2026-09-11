import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'

export async function sanitizeAndWrapUserInput(
  content: string,
  contentType: string,
  options: { isTitle?: boolean; includeReminder?: boolean } = {},
): Promise<string> {
  const sanitized = await sanitizePromptInjection(content, { isTitle: options.isTitle })
  return wrapExternalContent(sanitized, {
    source: 'user_message',
    contentType,
    includeReminder: options.includeReminder,
  })
}
