# 💬 Chatterly Backend – Chat Test Cases

## 🔹 Base URL

http://localhost:5000/api/chat

---

# ✅ 1. Send Message

**Endpoint:** POST http://localhost:5000/api/chat/send-message

### 🔸 Positive Test Cases

* Valid sender & receiver → Message sent successfully
* Message content stored in database
* If chat does not exist → New chat is created automatically
* Response contains:
  * messageId
  * senderId
  * receiverId
  * message text
  * timestamp

### 🔸 Negative Test Cases

* Missing receiverId → 400 Bad Request
* Missing content → 400 Bad Request
* Message with only spaces → "Message cannot be empty"
* Sender sending message to self → 400 Error
* Receiver not found → 404 Not Found
* Unauthorized user → 401 Unauthorized

---

# ✅ 2. Get Chat Messages

**Endpoint:** GET http://localhost:5000/api/chat/messages/:chatId

### 🔸 Positive Test Cases

* Valid chatId → Messages retrieved successfully
* Response contains list of messages
* Messages are in correct order (latest or oldest based on logic)

### 🔸 Negative Test Cases

* Missing chatId → 400 Bad Request
* Invalid chatId → 404 Not Found
* User not part of chat → 403 Forbidden
* No messages → Empty array response (200 OK)
* Unauthorized user → 401 Unauthorized

---

# ✅ 3. Start Chat

**Endpoint:** POST http://localhost:5000/api/chat/start-chat

### 🔸 Positive Test Cases

* Valid receiverId → Chat created or returned successfully
* If chat already exists → Same chat returned (no duplicate)
* Response contains:
  * chatId
  * participants (sender & receiver details)

### 🔸 Negative Test Cases

* Missing receiverId → 400 Bad Request
* Receiver not found → 404 Not Found
* User tries to start chat with self → 400 Bad Request
* Unauthorized user → 401 Unauthorized

---

# 🟡 4. Real-time Messaging (Socket.IO)

### Planned Test Cases

* User connects to socket successfully
* User joins chat room
* Message is emitted in real-time
* Receiver gets message instantly
* Multiple users in same room receive updates

**Status:** Pending / Needs Testing

---

# 🟡 5. Message Status (Delivered / Seen)

### Planned Test Cases

* Message marked as delivered
* Message marked as seen
* Status updated correctly in DB

**Status:** Pending

---

# 🟡 6. Media Messages (Images / Files)

### Planned Test Cases

* Upload image → Message sent with media URL
* Invalid file format → Error
* Large file → Rejected

**Status:** Pending (AWS S3 Integration Required)

---

# 🟡 7. Authentication for Chat APIs

### Test Cases

* Valid JWT token → Access granted
* Missing token → 401 Unauthorized
* Invalid token → Access denied

---

# 🟡 8. Firebase Integration (Notifications)

### Planned Test Cases

* Push notification sent on new message
* Notification received on receiver device

**Status:** Pending

---

# 📌 Notes

* All chat APIs require JWT authentication
* Token is generated from:
  * Verify Email OTP
  * Login API
* Use JWT token obtained from login APIs for testing
* Firebase & real-time features depend on backend completion

---

# 9. Reply Message

## Positive Test Cases

- Valid reply message → Reply sent successfully
- Reply linked to original message
- Emoji reply supported
- Reply visible in chat history

## Negative Test Cases

- Missing messageId → 400 Bad Request
- Missing chatId → 400 Bad Request
- Empty content → Validation error
- Unauthorized user → 401 Unauthorized
- Invalid messageId → 404 Not Found

---

# 10. Forward Message

## Positive Test Cases

- Valid message forwarded successfully
- Forward message visible in receiver chat
- Multiple forwards supported

## Negative Test Cases

- Missing messageId → 400 Bad Request
- Missing receiverId → 400 Bad Request
- Unauthorized user → 401 Unauthorized
- Invalid receiverId → 404 Not Found

---

# 11. Pin / Unpin Message

## Positive Test Cases

- Valid message pinned successfully
- Pinned message visible at top
- Message unpinned successfully

## Negative Test Cases

- Invalid messageId → 404 Not Found
- Unauthorized user → 401 Unauthorized
- User not part of chat → 403 Forbidden

---

# 12. Mark Chat as Unread

## Positive Test Cases

- Chat marked as unread successfully
- Unread count updated correctly

## Negative Test Cases

- Invalid chatId → 404 Not Found
- Unauthorized user → 401 Unauthorized

---

# 13. Create Group

## Positive Test Cases

- Group created successfully
- Multiple participants added successfully
- Group name saved correctly

## Negative Test Cases

- Empty group name → Validation error
- Empty participants list → Validation error
- Unauthorized user → 401 Unauthorized

---

# 14. Add / Remove Participants

## Positive Test Cases

- Participants added successfully
- Participants removed successfully
- Group updated correctly

## Negative Test Cases

- Invalid participantId → 404 Not Found
- Invalid groupId → 404 Not Found
- Unauthorized user → 401 Unauthorized

---

# 15. Get Group Details

## Positive Test Cases

- Group details fetched successfully
- Participants list returned correctly

## Negative Test Cases

- Invalid groupId → 404 Not Found
- Unauthorized user → 401 Unauthorized
- User not part of group → 403 Forbidden

---

