import { write } from '@data-stores/psql'

/** Settle visibility and owner selectivity on the dedicated, disposable hot corpus. */
export async function preparePublicationScopePlans(): Promise<void> {
  for (const table of [
    'posts',
    'topics',
    'post_topic_alias_sources',
    'relation__post__category__topic_alias',
    'rss_feed_categories',
    'rss_feed_item_categories',
  ] as const) {
    // no-mistakes-disable-next-line query-reached-per-item: six fixed fixture relations need separate VACUUM statements outside transactions before their owning captures.
    await write(`/* preparePublicationScopePlans */ VACUUM (ANALYZE) ${table}`)
  }
}
