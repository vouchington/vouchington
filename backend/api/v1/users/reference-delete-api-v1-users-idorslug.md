# DELETE /api/v1/users/:idOrSlug

[Back to Users API](README.md#delete-apiv1usersidorslug)

Commits the account privacy fence and durable deletion request, then returns HTTP `202` with
`{ logout: true }` if the current user deleted themselves. High-volume erasure and required Stripe,
S3, and Cloudflare cleanup continue through the `user-deletions` worker. The response body is
unchanged so existing clients still log out immediately; it does not assert internal completion.
