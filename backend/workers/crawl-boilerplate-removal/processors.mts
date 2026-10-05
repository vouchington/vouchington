import { getCrawlBoilerplateRemovalWorkLimit } from '@queues/crawl-boilerplate-removal/config'
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
import { readFile } from 'node:fs/promises'
import type { CrawlHtmlTempFile } from '@services/crawls/s3'
import {
  filterValidUtf8HtmlFiles,
  selectHtmlFilesWithinByteBudget,
} from './processors/html-file-selection.mts'

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
  return searchParentPathsNeedingBoilerplateRemoval(
    getCrawlBoilerplateRemovalWorkLimit('batch_size'),
  )
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
