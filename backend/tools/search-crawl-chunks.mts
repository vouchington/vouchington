import { searchCrawlChunks } from '@services/crawl-chunks/search'
import { createCrawlSearchTool } from './search-crawl-tool.mts'

// Adapter: createCrawlSearchTool passes { query, limit, hostname } but searchCrawlChunks takes (query, limit)
const tool = createCrawlSearchTool({
  name: 'search_crawl_chunks',
  description:
    'Search crawled web content chunks using full-text search. Returns matching markdown chunks from crawled pages.',
  queryDescription: 'Search query to match against crawled content chunks',
  searchFn: ({ query, limit = 5 }) => searchCrawlChunks(query, Math.max(1, limit)),
  meta: { surfaces: ['internal'], annotations: { readOnlyHint: true }, api: null },
})

export default tool
