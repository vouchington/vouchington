Follow up on review feedback that no one handled before a pull request merged. Pick at most one merged PR and fix its actionable feedback in one bounded follow-up PR, the way #1950 followed up #1935.

Unit: one merged PR.

pr-shepherd stops when a PR merges, so nothing else reads reviews that Codex, Copilot, and humans post around or after the merge. A comment can justify a change only when current repository evidence confirms it.

## Action steps

1. Scan every PR merged to `main` in the last two gaps between runs of this prompt. One gap is the number of files in `docs/prompts/scheduled/` divided by the loop's runs per day, in days; a skipped run doubles it. Round two gaps up to whole days and report both counts and the cutoff. Search returns at most 1000 results, so scan slices of at most one gap (`merged:<from>..<to>`, UTC), halving any slice whose `issueCount` exceeds 1000:

   ```bash
   gh api graphql --paginate -f q='repo:vouchington/vouchington is:pr is:merged base:main merged:<from>..<to>' -f query='
   query($q: String!, $endCursor: String) {
     search(query: $q, type: ISSUE, first: 50, after: $endCursor) {
       issueCount
       pageInfo { hasNextPage endCursor }
       nodes { ... on PullRequest {
         number mergedAt headRefOid
         reviews(first: 100) { totalCount nodes { fullDatabaseId url submittedAt body author { __typename } commit { oid } } }
         reviewThreads(first: 100) { totalCount nodes { isResolved } }
       } }
     }
   }' --jq '.data.search | {issueCount, prs: (.nodes | length)},
     (.nodes[] | . as $p | ([.reviewThreads.nodes[] | select(.isResolved | not)] | length) as $open |
       (select(.reviews.totalCount > 100 or .reviewThreads.totalCount > 100) | {truncated: $p.number}),
       (select($open > 0) | {pr: $p.number, mergedAt: $p.mergedAt, openThreads: $open}),
       (.reviews.nodes[] | select((.body | length) > 0 and (.submittedAt > $p.mergedAt
           or (.commit.oid == $p.headRefOid and .author.__typename != "Bot")))
         | {pr: $p.number, mergedAt: $p.mergedAt, kind: "review", id: .fullDatabaseId, url: .url}))'
   ```

   The `prs` counts of a slice must add up to its `issueCount`; a `{truncated: <PR>}` record means read the rest with `after` cursors. A `kind: "review"` record is a non-empty review submitted after the merge, or a person's review of the final commit (which can land before the merge with no inline thread). Bot review bodies mostly repeat their inline threads. For each `openThreads` PR, read its threads:

   ```bash
   gh api graphql -F n=<PR> -f query='
   query($n: Int!) {
     repository(owner: "vouchington", name: "vouchington") {
       pullRequest(number: $n) {
         number mergedAt
         reviewThreads(first: 100) {
           nodes { isResolved comments(first: 1) { totalCount nodes { fullDatabaseId url } } }
         }
       }
     }
   }' --jq '.data.repository.pullRequest | . as $p | .reviewThreads.nodes[]
     | select(.isResolved == false and .comments.totalCount == 1)
     | {pr: $p.number, mergedAt: $p.mergedAt, kind: "comment", id: .comments.nodes[0].fullDatabaseId, url: .comments.nodes[0].url}'
   ```

   A `kind: "comment"` record is an unresolved, unreplied thread whenever posted. Candidates are these two record kinds, keyed by `mergedAt` and the 64-bit `fullDatabaseId`. Ignore issue comments, status comments, and resolved threads. Report the cutoff, slices, page and PR counts against `issueCount`, truncated PRs, and candidate count; claim no coverage beyond this window.

2. Drop covered items. Search PRs and issues in every state, through GraphQL `search(type: ISSUE)` returning `state`, `body`, and `authorAssociation`, for each candidate's marker `<!-- post-merge-review: <PR number> <comment|review> <fullDatabaseId> -->` and comment URL; confirm the exact marker or URL in the body. A hit covers the item only when its author is OWNER, MEMBER, or COLLABORATOR and it records a disposition (listed under `### Post-merge review items`, in a `Declined comment` block, or linked as the thing it handles). A closed, unmerged follow-up listing the item declined it: do not recreate it. An open follow-up covers only the items it lists.
3. Read each remaining item in full (`gh api repos/vouchington/vouchington/pulls/comments/<id>` or `.../pulls/<PR>/reviews/<id>`) and judge it against current `origin/main`. It is actionable when it names a defect or missing check that still exists, evidence confirms it, and the fix is bounded; otherwise it is non-actionable (already fixed, wrong, preference-only, duplicate, or against a documented decision).
4. Take the PR with the earliest `mergedAt` that has an actionable item and fix all its actionable items in one change, with tests for behavior changes. If the verified owning PR addresses a different merged PR, report the pending item and stop; if the same one but missing an item, push to it and add the item to its body. Items with no bounded fix are recommendations. Record every other PR's actionable items as pending (URL and one-line reason) in the report and under `### Pending post-merge review items`; pending items are not covered, and ones that leave the window are not revisited.
5. Immediately before publishing, re-fetch the selected PR's threads and repeat the step 2 search; drop anything replied to, resolved, or covered since. With no actionable item left, discard the patch and report a no-op; a PR that only records declined comments is not an improvement.
6. Title: `Automation scheduled: post-merge-review.md` then a conventional remainder such as `fix(scope): address the post-merge review of #<merged PR>`. Shape the body like #1950: a `## Summary` table of comment, before, and after, plus `## Impact`. Add a `### Post-merge review items` `details` entry listing each handled item's URL followed by its marker on the next line; put each non-actionable item of the same PR in a collapsed `<details>` titled `Declined comment` with reason and marker; add `### Pending post-merge review items` when step 4 left any. Pass `noSourceIssue: { reason: "scheduled prompt run" }` and state `This follows up #<merged PR>.` in `summary`.

With no actionable item, report a verified no-op: the query, PR and item counts, and each non-actionable or recommended item with URL and reason. A no-op records nothing, so a non-actionable item reappears until it leaves the window.
