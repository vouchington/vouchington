# messaging

Source entrypoint: [backend/services/messaging/README.md](../../../../../backend/services/messaging/README.md)

Service for user-to-user direct messages (DMs) and group conversations.
Wraps the `conversations` / `conversation_participants` / `conversation_messages`
tables for the `direct_message` channel type.

## Functions

- `findOrCreateDirectConversation(currentUserId, recipientUserId)` — dedup or create a 1:1 DM
- `createGroupConversation(currentUserId, recipientUserIds)` — create an N-party DM
- `createConversationMessage(currentUserId, provenance, conversationId, bodyText)` — send a message, recording the sending request's [content provenance](../../../../requirements/content/content-provenance.md)
- `getMyDirectConversations(currentUserId, opts)` — list current user's DM threads
- `getConversationMessages(conversationId, opts)` — list messages in a thread
- `getConversationParticipants(conversationId)` — list active participants
- `currentUserCanViewConversation` / `currentUserCanSendMessage` — participant-based auth
- `currentUserCanMessageUsers(currentUserId, recipients)` — DM gate for one or many recipients in
  a single set-based query (block or mute in either direction, follow and mutual-follow state),
  then each recipient's `direct_messages_audience` decides: `everyone`/`users` allow, `followers`
  needs sender-follows, `mutual_followers` needs both directions, `nobody` and unknown deny. True
  only when every recipient allows the sender. REST (`POST /my/messages`, participant add) is the
  only caller; group creation also runs `anyPairAmongUsersBlockedOrMuted` for recipient pairs.
