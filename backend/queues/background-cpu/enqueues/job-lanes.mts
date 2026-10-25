export function crawlOrderingKey(name: string, isDispatcher: boolean): string {
  if (name === 'boilerplate_removal') return 'crawl:boilerplate'
  return isDispatcher ? 'crawl:dispatch' : 'crawl:task'
}

export function contentAnalysisOrderingKey(isDispatcher: boolean): string {
  return isDispatcher ? 'content-analysis:dispatch' : 'content-analysis:task'
}
