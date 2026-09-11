# messaging

Service for user-to-user direct messages (DMs) and group conversations.
Wraps the `conversations` / `conversation_participants` / `conversation_messages`
tables for the `direct_message` channel type.

## Functions

- `findOrCreateDirectConversation(currentUserId, recipientUserId)` — dedup or create a 1:1 DM
- `createGroupConversation(currentUserId, recipientUserIds)` — create an N-party DM
- `createConversationMessage(currentUserId, conversationId, bodyText)` — send a message
- `getMyDirectConversations(currentUserId, opts)` — list current user's DM threads
- `getConversationMessages(conversationId, opts)` — list messages in a thread
- `getConversationParticipants(conversationId)` — list active participants
- `currentUserCanViewConversation` / `currentUserCanSendMessage` — participant-based auth
- `currentUserCanMessageUser` — DM gate (block, mute, `direct_messages_audience` check)
