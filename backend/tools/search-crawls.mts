import { toolsSearchCrawls } from '@services/crawls/tools/text'
import { createCrawlSearchTool } from './search-crawl-tool.mts'

const tool = createCrawlSearchTool({
  name: 'search_crawls',
  description:
    'Search crawled web content using full-text search. Returns matching content chunks from crawled pages.',
  queryDescription: 'Search query to match against crawled content',
  searchFn: toolsSearchCrawls,
  meta: {
    surfaces: ['internal'],
    title: 'Search Crawled Pages',
    annotations: { readOnlyHint: true },
    api: null,
  },
})

export default tool
