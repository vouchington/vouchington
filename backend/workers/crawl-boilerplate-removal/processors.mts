import { getLatestHtmlByUrlIds } from '@services/crawls/get-html-by-url-ids'
import {
  searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId,
  updateCrawlerCssSelectorsByHostname,
} from '@services/crawlers'
import {
  getLatestBoilerplateRemovalByHostnameAndPath,
  createBoilerplateRemoval,
  searchParentPathsNeedingBoilerplateRemoval,
  type ParentPathCandidate,
} from '@services/boilerplate-removals'
import { extractDomRemovals } from '@jongleberry/vurst-html'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { CrawlHtmlTempFile } from '@services/crawls/s3'

const BOILERPLATE_REMOVAL_BATCH_SIZE = 500

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
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

async function readHtmlFiles(files: CrawlHtmlTempFile[]): Promise<Buffer[]> {
  const htmlPages: Buffer[] = []
  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- sequential reads preserve the selected aggregate-memory budget.
    htmlPages.push(await readFile(file.filePath))
  }
  return htmlPages
}

let extractQueue = Promise.resolve()

async function extractDomRemovalsExclusively(files: CrawlHtmlTempFile[]) {
  const previous = extractQueue
  let release: () => void = () => undefined
  extractQueue = new Promise<void>(resolve => {
    release = resolve
  })
  await previous
  try {
    return await extractDomRemovals(await readHtmlFiles(files))
  } finally {
    release()
  }
}

export const processBoilerplateRemovalDispatcher = (): Promise<ParentPathCandidate[]> => {
  return searchParentPathsNeedingBoilerplateRemoval(BOILERPLATE_REMOVAL_BATCH_SIZE)
}

export const processBoilerplateRemoval = async (
  hostnameId: string,
  parentPath: string,
): Promise<{ hostname_id: string; parent_path: string; skipped: boolean }> => {
  const existing = await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, parentPath)
  if (existing) {
    return { hostname_id: hostnameId, parent_path: parentPath, skipped: true }
  }

  const candidates = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
    hostnameId,
    parentPath,
  )
  const urlIds = candidates.map(c => c.id)
  if (candidates.length < 2) {
    await createBoilerplateRemoval(
      hostnameId,
      parentPath,
      { cssSelectorsToRemove: [], htmlToRemove: [] },
      urlIds,
    )
    return { hostname_id: hostnameId, parent_path: parentPath, skipped: true }
  }

  const htmlFiles = await getLatestHtmlByUrlIds(urlIds)
  try {
    const validHtmlFiles = await filterValidUtf8HtmlFiles(htmlFiles)
    const budgetedHtmlFiles = selectHtmlFilesWithinByteBudget(validHtmlFiles)
    if (budgetedHtmlFiles.length < 2) {
      await createBoilerplateRemoval(
        hostnameId,
        parentPath,
        { cssSelectorsToRemove: [], htmlToRemove: [] },
        urlIds,
      )
      return { hostname_id: hostnameId, parent_path: parentPath, skipped: true }
    }

    const results = await extractDomRemovalsExclusively(budgetedHtmlFiles)
    await createBoilerplateRemoval(hostnameId, parentPath, results, urlIds)

    if (results.cssSelectorsToRemove.length > 0) {
      await updateCrawlerCssSelectorsByHostname(hostnameId, results.cssSelectorsToRemove)
    }

    return { hostname_id: hostnameId, parent_path: parentPath, skipped: false }
  } finally {
    await Promise.all(htmlFiles.map(file => file.cleanup()))
  }
}
