# Vote Components

`ScoreVote` is the shared semantic-choice control for elections. It never accepts or displays
numeric vote strength. The API returns the viewer's current `choice`; voting sends a semantic
choice with `PUT`. Public viewers retract a sentiment ballot by choosing Neutral, which is scored.
Neutral is hidden until a ballot already exists. Binary policies have no Neutral and no Neutral
retract. `DELETE` Clear remains on the API; public UIs hide it and official Clear-only controls
still use it for a historical ballot.

```tsx
import { clearPostVote, submitPostVote } from '@/lib/api/client/elections'
import { ScoreVote } from '@/components/votes/score-vote'

;<ScoreVote
  entityType='post'
  electionId={election.id}
  countUp={election.votes_count_up ?? 0}
  countDown={election.votes_count_down ?? 0}
  existingVoteChoice={electionVote?.choice}
  submitVote={submitPostVote}
  clearVote={clearPostVote}
  signedOut={!currentUserId}
/>
```

Use `policy='sentiment'` for posts, comments, news, topics, hostnames, and users;
`recommendation` for support/oppose; `relation` for confirm/dispute; and `moderation` for
accurate/inaccurate. Compact sentiment controls expose a labelled popover. Spacious surfaces use
`presentation='group'`, which renders the five labelled radio choices. Binary policies use their
two compact buttons. `clearVote` remains on the client so official Clear-only controls can still
send `DELETE` for a historical ballot without casting Neutral.

`VoteStoreProvider` and `useElectionVote` synchronize repeated `(entityType, electionId)`
controls. Optimistic count reconciliation is sign-based: same-sign changes retain raw counts,
sign transitions shift the appropriate positive/negative raw counts, and Neutral affects neither
raw sign count. Rejected mutations roll back the shared entry and preserve the previous error
recovery callback.

Stable Playwright IDs use the component `data-pw` base: `-trigger`, `-choices-{choice}`, binary
`-{choice}`, `-clear`, and `-sign-in`. Raw count IDs remain `vote-count-up` and
`vote-count-down`.

The client API lives in `web/lib/api/client/elections.ts`; relation voting is in
`web/lib/api/client/entity-relations.ts`.
