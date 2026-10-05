# Post card anatomy

[Back to Post Anatomy](post.md#list-item--card-anatomy)

| Element          | Shows                                                                      | Visible when                                                                                 |
| ---------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Post type badge  | Humanized type label, color-coded (see table above)                        | Always                                                                                       |
| Review rating    | Star display (e.g. ★★★★☆)                                                  | Review posts only                                                                            |
| Category badges  | Up to 5 category topic chips (outline variant)                             | When categories exist                                                                        |
| Share actions    | Share/Send to followers                                                    | Signed-in, not creator, top-level, public post                                               |
| Title            | Post title or fallback                                                     | Always                                                                                       |
| Body preview     | Markdown preview with heading demotion (no page-level h1 conflict)         | Always                                                                                       |
| Author           | Username link — **no avatar on cards**                                     | When not anonymous                                                                           |
| Timestamp        | Relative post age                                                          | Always                                                                                       |
| Vote             | Semantic choice control; hides negative count from non-members             | When post has an election                                                                    |
| Comment count    | Number of top-level comments                                               | When comments exist                                                                          |
| Save             | Bookmark toggle                                                            | Signed-in viewers                                                                            |
| Hide             | Hides from viewer's feed                                                   | Signed-in viewers                                                                            |
| Broadcast badge  | Audience indicator (followers / signed-in / mutual)                        | Only for `followers`/`users`/`mutual_followers` broadcast — **not** for `everyone`           |
| Provenance badge | "via API", "via MCP" or "via {app}" outline badge from `provenance`        | Only when `provenance` is present (API and MCP posts); never for web, native or system posts |
| Channel badge    | Raw channel from `staff_provenance` (web, swift, dotnet, api, mcp, system) | Administrators and moderators only; every post                                               |
| Report           | Opens report dialog; `...` overflow only                                   | Signed-in, non-author viewers                                                                |

The label row (`[PostType] [Rating] [Categories] … [Share]`) uses a single-line horizontal scroll;
share actions are pushed right with `ml-auto`.
