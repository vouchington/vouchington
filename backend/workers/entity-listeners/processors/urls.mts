import { getUrlById } from '@services/urls/get'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import { computeParentPath } from '@ts-shared/utils/urls'
import { enqueueBulkBoilerplateRemoval } from '@queues/crawl-boilerplate-removal/enqueues'

export const processUrlCreated = async (
  { id }: { id: string },
  options: Parameters<typeof getUrlById>[1] = {},
) => {
  const url = await getUrlById(id, options)
  if (!url) return

  if (url.hostname.blocked || url.hostname.crawlable === false) return

  await getOrCreateCrawlerForHostname(null, url.hostname.id, options)

  await triggerBoilerplateRemoval(url.hostname.id, url.pathname)
}

async function triggerBoilerplateRemoval(hostnameId: string, pathname: string) {
  const parentPath = computeParentPath(pathname)
  if (parentPath !== null) {
    await enqueueBulkBoilerplateRemoval([{ hostnameId, parentPath }])
  }
}

export const processUrlUpdated = () => {}

export const processUrlDeleted = () => {}
