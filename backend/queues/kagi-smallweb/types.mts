export type KagiSmallWebDispatcherJobs = 'sync'
export type KagiSmallWebProcessJobs = 'processFeed'

export type KagiFeedJobData = {
  feedUrl: string
  name: string
  slug: string
  sourceType: 'web' | 'comic' | 'youtube'
}
