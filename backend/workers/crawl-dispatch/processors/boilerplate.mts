import {
  enqueueBulkBoilerplateRemoval,
  enqueueBoilerplateRemovalDispatcher,
} from '@queues/crawl-dispatch/enqueues/boilerplate'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'
import { getCrawlBoilerplateRemovalWorkLimit } from '@queues/crawl-dispatch/config'
import { getHtmlBySelectedCrawls } from '@services/crawls/get-html-by-url-ids'
import {
  searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId,
  updateCrawlerCssSelectorsByHostname,
} from '@services/crawlers'
import {
  getLatestBoilerplateRemovalByHostnameAndPath,
  createBoilerplateRemoval,
  sweepNextBoilerplateHostnameBatch,
  type ParentPathCandidate,
} from '@services/boilerplate-removals'
import { extractDomRemovals } from '@jongleberry/vurst-html'
import { readFile } from 'node:fs/promises'
import type { CrawlHtmlTempFile } from '@services/crawls/s3'
import {
  filterValidUtf8HtmlFiles,
  selectHtmlFilesWithinByteBudget,
} from './html-file-selection.mts'

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

export const processBoilerplateRemovalDispatcher = (
  admit: (candidates: ParentPathCandidate[]) => Promise<void>,
  continuation?: BackgroundCpuJobPayloads['crawl.boilerplate_removal_dispatcher']['continuation'],
): Promise<ParentPathCandidate[]> => {
  return sweepNextBoilerplateHostnameBatch(
    {
      hostnameBatchSize: getCrawlBoilerplateRemovalWorkLimit('hostname_batch_size'),
      candidateLimit: getCrawlBoilerplateRemovalWorkLimit('batch_size'),
    },
    admit,
    async next => {
      await enqueueBoilerplateRemovalDispatcher(next)
    },
    continuation,
  )
}

export const processBoilerplateRemoval = async (
  hostnameId: string,
  parentPath: string,
  continuation: {
    after?: string
    crawl_after?: string
    samples?: { url_id: string; crawl_id: string }[]
  } = {},
): Promise<{ hostname_id: string; parent_path: string; skipped: boolean; deferred?: boolean }> => {
  const existing = await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, parentPath)
  if (existing) {
    return { hostname_id: hostnameId, parent_path: parentPath, skipped: true }
  }

  const page = await searchCrawlerBoilerplateRemovalUrlCandidatesByHostnameId(
    hostnameId,
    parentPath,
    getCrawlBoilerplateRemovalWorkLimit('batch_size'),
    {},
    () => new Date(),
    continuation.after,
    continuation.crawl_after,
  )
  const remainingSlots = 3 - (continuation.samples?.length ?? 0)
  const selectedCandidates = page.candidates.slice(0, remainingSlots)
  const nextAfter =
    page.candidates.length > remainingSlots ? selectedCandidates.at(-1)!.id : page.after
  const nextCrawlAfter = page.candidates.length > remainingSlots ? undefined : page.crawl_after
  const samples = [
    ...(continuation.samples ?? []),
    ...selectedCandidates.map(candidate => ({
      url_id: candidate.id,
      crawl_id: candidate.crawl_id,
    })),
  ]
  const urlIds = samples.map(sample => sample.url_id)
  if (urlIds.length < 3 && nextAfter) {
    await enqueueBulkBoilerplateRemoval([
      { hostnameId, parentPath, after: nextAfter, crawlAfter: nextCrawlAfter, samples },
    ])
    return { hostname_id: hostnameId, parent_path: parentPath, skipped: false, deferred: true }
  }
  if (urlIds.length < 2) {
    await createBoilerplateRemoval(
      hostnameId,
      parentPath,
      { cssSelectorsToRemove: [], htmlToRemove: [] },
      urlIds,
    )
    return { hostname_id: hostnameId, parent_path: parentPath, skipped: true }
  }

  const htmlFiles = await getHtmlBySelectedCrawls(samples)
  try {
    const validHtmlFiles = await filterValidUtf8HtmlFiles(htmlFiles)
    const budgetedHtmlFiles = selectHtmlFilesWithinByteBudget(validHtmlFiles)
    if (budgetedHtmlFiles.length < 2) {
      if (nextAfter) {
        const selectedPaths = new Set(budgetedHtmlFiles.map(file => file.filePath))
        const retainedSamples = htmlFiles.flatMap(file =>
          selectedPaths.has(file.filePath) ? [{ url_id: file.urlId, crawl_id: file.crawlId }] : [],
        )
        await enqueueBulkBoilerplateRemoval([
          {
            hostnameId,
            parentPath,
            after: nextAfter,
            crawlAfter: nextCrawlAfter,
            samples: retainedSamples,
          },
        ])
        return { hostname_id: hostnameId, parent_path: parentPath, skipped: false, deferred: true }
      }
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
