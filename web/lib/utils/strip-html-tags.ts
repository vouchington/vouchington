import { htmlFragmentToPlainText } from '@/lib/html/safe-html-fragment'

/** Strip HTML tags and decode HTML entities from a string, returning plain text. */
export function stripHtmlTags(input: string): string {
  if (!/[<&]/.test(input)) {
    return input.replace(/[\s\u00A0]+/g, ' ').trim()
  }

  return htmlFragmentToPlainText(input)
}
