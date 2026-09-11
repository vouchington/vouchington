# PATCH /api/v1/users/:idOrSlug

[Back to Users API](README.md#patch-apiv1usersidorslug)

Updates profile and settings fields for the target user when the current user is the same user or an
admin. Localization settings are intentionally separate: `country` accepts ISO 3166-1 alpha-2
country codes, and `ui_locale` accepts one of the supported interface locales. Content language is
stored on the content itself, not on the user profile.
