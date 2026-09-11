# Posts — User Flow Matrix

[← User Flows](./README.md)

Authorization: tiered — Author (24 h content-edit window, `POST_CONTENT_EDIT_WINDOW_EXPIRED`) → Signed-in users → CM/CO (lock, unpublish, pin, community mod queue) → SA (site review queue, any post).

All 4 personas diverge meaningfully. No draft state — all created posts publish immediately.

Spec paths relative to `playwright/tests/`.

| Flow                                              | Personas                | Existing spec                                                                      | Status                                                                                            |
| ------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Browse type listings (reviews, discussions, etc.) | Anon, RU                | `posts/reviews.spec.mts`, `posts/discussions.spec.mts`, `posts/all-posts.spec.mts` | ✅                                                                                                |
| Post detail (heading, content, review badge)      | Anon, RU                | `posts/post-detail.spec.mts`                                                       | ✅                                                                                                |
| Create discussion                                 | Anon(neg), RU           | `posts/create-contribution-gating.spec.mts`                                        | 🟡 gating tested; actual create success path not exercised (P1)                                   |
| Create review (with contribution gate)            | Anon(neg), RU           | `posts/create-contribution-gating.spec.mts`, `posts/reviews.spec.mts`              | 🟡 gate + listing covered; form submit not exercised (P1)                                         |
| Create data point (with contribution gate)        | Anon(neg), RU           | `posts/create-contribution-gating.spec.mts`, `posts/data-points.spec.mts`          | 🟡 gate + listing covered; form submit not exercised (P1)                                         |
| Create link (submit URL)                          | RU                      | `posts/links-create.spec.mts`                                                      | ✅                                                                                                |
| Admin create article / blog post                  | SA                      | `posts/admin-create-bypass.spec.mts`, `posts/articles.spec.mts`                    | ✅                                                                                                |
| Vouch / Disavow vote                              | Anon, RU                | `voting/existing-vote-state.spec.mts`, `posts/post-detail.spec.mts`                | 🟡 vouch click covered; disavow not exercised (P6)                                                |
| Comment (top-level + nested reply)                | Anon, RU                | `posts/comments.spec.mts`, `posts/post-detail.spec.mts`                            | ✅                                                                                                |
| Comment vote                                      | Anon, RU                | `posts/comments.spec.mts`                                                          | ✅                                                                                                |
| Edit post (author 24 h window)                    | Author, SA              | `posts/post-edit.spec.mts`, `posts/post-edit-window.spec.mts`                      | ✅                                                                                                |
| Edit post after 24 h (window expired)             | Author, SA              | `posts/post-edit-window.spec.mts`                                                  | ✅                                                                                                |
| Delete post                                       | Author, Anon(neg), SA   | `posts/post-delete.spec.mts`                                                       | ✅                                                                                                |
| Save / Unsave post                                | Anon, RU                | `posts/post-save.spec.mts`                                                         | ✅                                                                                                |
| Hide / Unhide post                                | Anon, RU                | `posts/post-hide.spec.mts`                                                         | ✅                                                                                                |
| Report post (non-author only)                     | RU, Author(neg)         | `reporting/report-{post,post-direct,dialog}.spec.mts`                              | ✅                                                                                                |
| Lock / Unlock post                                | Author, SA              | `posts/post-lock.spec.mts`                                                         | ✅                                                                                                |
| Archive / Unarchive post                          | Author, SA              | `posts/post-archive.spec.mts`                                                      | ✅                                                                                                |
| Audience + privacy controls (broadcast/privacy)   | RU                      | `posts/broadcast-privacy.spec.mts`                                                 | ✅                                                                                                |
| Anonymous post (author hidden)                    | RU                      | `posts/broadcast-privacy.spec.mts`                                                 | ✅                                                                                                |
| Community create (active member only)             | RU(non-member)(neg), CO | `communities/community-posts.spec.mts`                                             | 🟡 community posting covered; contribution-gated review/data-point in communities not tested (P2) |
| Community mod queue (approve / reject)            | CM/CO, RU(neg)          | `communities/community-mod-queue.spec.mts`                                         | 🟡 CO path covered; CM action paths untested (P3)                                                 |
| Community pin / unpin post                        | CM/CO                   | `communities/community-features.spec.mts`                                          | ✅                                                                                                |
| Community unpublish post                          | CM/CO, RU(neg)          | `communities/community-unpublish.spec.mts`                                         | 🟡 CM path untested (P3)                                                                          |
| Site review queue approve / reject                | SA                      | `admin/review-queue.spec.mts`                                                      | ✅                                                                                                |
| Manage tags / review ratings                      | Author, SA              | `posts/post-detail.spec.mts`                                                       | 🟡 buttons visible; full tag-manage flow not exercised (P4)                                       |
| SM: no elevated post powers beyond RU             | SM                      | —                                                                                  | 🔴 SM persona not explicitly tested against post flows (P5)                                       |

## Workstream Key

| Label | Description                                                                                              | Tracking                            |
| ----- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| P1    | Create discussion / review / data point success path (form submit → published, navigates to post detail) | TBD                                 |
| P2    | Community contribution gate for reviews + data points (requires community opt-in flag)                   | TBD                                 |
| P3    | CM (community moderator) action paths in mod queue and unpublish flows                                   | #see `MODERATION-TEST-MATRIX.md` B2 |
| P4    | Manage tags + review ratings full flow (add/remove tag, star rating)                                     | TBD                                 |
| P5    | SM persona boundary — confirmed no elevated post powers beyond regular user                              | #see `MODERATION-TEST-MATRIX.md` B1 |
| P6    | Post Disavow (−2) click and state verification                                                           | TBD                                 |
