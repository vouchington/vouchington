# GET /api/v1/posts/:idOrSlug

[Back to Posts API](README.md#get-apiv1postsidorslug)

Returns the post detail payload. Response includes `post`, `html`, `post_metrics`,
`post_election`, and `communities` for community-scoped posts. For authenticated users it may also
include `bookmarks` and `election_vote`.

When the current user is the creator or an admin, the `post` object also includes `can_edit_content: boolean`. This field is `true` if the post was created within the last 24 hours (or the viewer is an admin), and `false` if the edit window has expired.
