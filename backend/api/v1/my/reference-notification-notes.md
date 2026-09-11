# Notification Notes

[Back to My API](README.md#notification-notes)

- Old notifications are preserved after unsubscribe actions
- Clicking a notification in the web app should call `PATCH /api/v1/my/notifications/:id` before navigation
- RSS feed item notifications navigate through an internal `/notification-redirect` page that resolves the external target server-side
- User deletes are asynchronous soft deletes
- Push delivery configuration depends on `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`
- Community lifecycle, weekly digest, and reporter review rows enqueue browser push through the same
  delivery path; structured community push targets carry a safe resolved slug, while digests and
  reporter reviews target the inbox.
