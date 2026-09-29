# RSS Unreliable Status Codes

Source entrypoint: [backend/modules/rss-unreliable-status-codes/README.md](../../../../../../backend/modules/rss-unreliable-status-codes/README.md)

Shared validation for RSS feed and hostname `unreliable_status_codes` operator settings.

Values must be `null` or an array of integer 4xx HTTP status codes. Valid arrays are deduplicated and sorted before persistence.
