# PATCH /api/v1/users/:idOrSlug

[Back to Users API](../../../../../backend/api/v1/users/README.md#patch-apiv1usersidorslug)

Updates profile and settings fields for the target user when the current user is the same user or an
admin. Localization settings are intentionally separate: `country` accepts ISO 3166-1 alpha-2
country codes, and `ui_locale` accepts one of the supported interface locales. Content language is
stored on the content itself, not on the user profile.

The body is a closed object: an unknown field or a wrong type returns `422` (`Invalid request body`).
The check runs after authentication and the suspension check but before the service resolves the
target user, so a malformed body from a caller who may not edit the target is also `422`. See the
[selected user-update request cases](../../reference-content-routes-request-validation.md#user-updates-and-data-request-stream).

The `update_my_preferences` MCP tool runs this route's command for the caller only, with an allow-listed
subset of the body: visibility, messaging, post defaults, country, locale, and Hacker News discussions. It
needs the `preferences:read` and `preferences:write` scopes and a Plus plan. See
[Profile, Notification, and Preference Write Tools](../../../../overview/architecture/agent-tools/profile-notification-write-tools.md).
