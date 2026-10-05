import { createReadStream } from 'node:fs'
import type { CrawlHtmlTempFile } from '@services/crawls/s3'

// extractDomRemovals (vurst-html, Rust N-API) enforces its own hard combined-input byte cap,
// independent of and coincidentally equal to our unrelated per-page crawl-storage limit
// (MAX_CRAWL_HTML_BYTES in services/crawls/s3.mts). It is not exposed in the package's TS types;
// this value is the exact max observed in the "Input too large: X bytes (max Y bytes)" error
// (BACKEND-KA). A single crawled page can already be up to 10MB, so the default 3 candidates can
// sum well past this cap.
const VURST_HTML_MAX_COMBINED_BYTES = 10 * 1024 * 1024

export async function filterValidUtf8HtmlFiles(
  htmlFiles: CrawlHtmlTempFile[],
): Promise<CrawlHtmlTempFile[]> {
  const validFiles: CrawlHtmlTempFile[] = []
  for (const file of htmlFiles) {
    // oxlint-disable-next-line no-await-in-loop -- one streamed validation at a time keeps file reads bounded.
    if (await isUtf8File(file.filePath)) validFiles.push(file)
  }
  return validFiles
}

// Selects as many pages as fit within the budget, smallest first, to maximize sample diversity
// for boilerplate detection rather than truncating any page's content mid-byte.
export function selectHtmlFilesWithinByteBudget(
  htmlFiles: CrawlHtmlTempFile[],
  maxTotalBytes: number = VURST_HTML_MAX_COMBINED_BYTES,
): CrawlHtmlTempFile[] {
  const sorted = htmlFiles.toSorted((a, b) => a.byteLength - b.byteLength)
  const selected: CrawlHtmlTempFile[] = []
  let total = 0
  for (const file of sorted) {
    if (total + file.byteLength > maxTotalBytes) break
    selected.push(file)
    total += file.byteLength
  }
  return selected
}

async function isUtf8File(filePath: string): Promise<boolean> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    for await (const chunk of createReadStream(filePath)) {
      decoder.decode(chunk as Buffer, { stream: true })
    }
    decoder.decode()
    return true
  } catch (err) {
    if (err instanceof TypeError) return false
    throw err
  }
}
