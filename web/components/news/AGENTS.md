# News components

- `NewsDiscussMenu` reads `useAuth()`, never auth props; every branch renders `data-pw='news-discuss-button'`.
- Cluster members are bare `NewsItemCard`s with `border-t`, never nested Cards. Official-source badges belong in matching member headers, never story-title wrappers.
- Only `NewsItemCluster` filters the story post from `relatedPosts`.
- Source topic links use `latest`; category chips use `news`. RSS ScoreVote never receives `hideDownCount`.
