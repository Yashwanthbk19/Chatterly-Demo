# Chatterly API Documentation

## Base URL

Live:
https://chatterly.stacklycloud.com/api/

Local:
http://localhost:5000/api/

Note:
EC2 public IP may change after restart. Prefer domain URL instead of hardcoded IP.

---

## 1. Health Check

**Endpoint**
GET /health

**Description**
Checks whether the backend server is running.

**Response**

{
"status": "OK"
}

---

## 2. Send Email OTP

**Endpoint**
POST /auth/send-email-otp

**Description**
Sends a One-Time Password (OTP) to the user's email.

**Request Body**

{
"email": "demo1@test.com"
}

**Response**

{
"message": "OTP sent to email"
}

**Validation Cases**

Invalid email:

Request:

```json
{
  "email": "demo1"
}
```

Response:

```json
{
  "message": "Invalid email format"
}
```

Empty email:

Request:

```json
{
  "email": ""
}
```

Response:

```json
{
  "message": "Email is required"
}
```
---

## 3. Verify Email OTP

**Endpoint**
POST /auth/verify-email-otp

**Description**
Verifies the OTP received via email and authenticates the user.

**Request Body**

{
"email": "demo1@test.com",
"otp": "123456789",
}

**Response**

{
"message": "Email verified",
"user": {
"name": "demo1",
"email": "demo1@test.com",
"profilePic": "https://ui-avatars.com/api/?name={Username}",
"authProvider": "email",
"isVerified": true,
"status": "offline",
"\_id": "69bd325fa0f4c9c5537db4f7",
"createdAt": "2026-03-20T11:41:19.023Z",
"updatedAt": "2026-03-20T11:41:19.023Z",
"\_\_v": 0
},
"token": "jwt_token_here",
"isProfileComplete": false
}

**Validation Cases**

### 1. Invalid OTP

Request:

```json
{
  "email": "demo1@test.com",
  "otp": "111111"
}
```

Response:

```json
{
  "message": "Invalid or expired OTP."
}
```

---

### 2. Empty OTP

Request:

```json
{
  "email": "demo1@test.com",
  "otp": ""
}
```

Response:

```json
{
  "message": "OTP is required"
}
```

---

### 3. Empty Email

Request:

```json
{
  "email": "",
  "otp": "123456"
}
```

Response:

```json
{
  "message": "Email is required"
}
```

---

### 4. Invalid Email Format

Request:

```json
{
  "email": "demo1",
  "otp": "123456"
}
```

Response:

```json
{
  "message": "Invalid email format"
}
```

---

### 5. Expired OTP

Request:

```json
{
  "email": "demo1@test.com",
  "otp": "123456"
}
```

Response:

```json
{
  "message": "Invalid or expired OTP."
}
```
---

## 4. Login User via email

**Endpoint**
POST /auth/login

**Description**
Logs in the user using email and password.

**Request Body**

{
"email": "demo1@test.com",
"password": "123456789"
}

**Response**

{
"user": {
"\_id": "69bd325fa0f4c9c5537db4f7",
"name": "demo1",
"email": "demo1@test.com",
"profilePic": "https://ui-avatars.com/api/?name={Username}",
"authProvider": "email",
"isVerified": true,
"status": "offline",
"createdAt": "2026-03-20T11:41:19.023Z",
"updatedAt": "2026-03-20T11:41:19.023Z",
"\_\_v": 0
},
"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmQzMjVmYTBmNGM5YzU1MzdkYjRmNyIsImlhdCI6MTc3NDAwNzAyMiwiZXhwIjoxNzc0NjExODIyfQ.E_pkKYZDe0fFKY8gTQAM7xvX3EGkTGti5xmsu3ymuXU",
"isProfileComplete": false
}

**Validation Cases**

### 1. Invalid Email Format

Request:

```json
{
  "email": "demo1",
  "password": "123456789"
}
```

Response:

```json
{
  "message": "Invalid email format"
}
```

---

### 2. Empty Email

Request:

```json
{
  "email": "",
  "password": "123456789"
}
```

Response:

```json
{
  "message": "Email is required"
}
```

---

### 3. Empty Password

Request:

```json
{
  "email": "demo1@test.com",
  "password": ""
}
```

Response:

```json
{
  "message": "Password is required"
}
```

---

### 4. Wrong Password

Request:

```json
{
  "email": "demo1@test.com",
  "password": "wrongpassword"
}
```

Response:

```json
{
  "message": "Invalid credentials"
}
```

---

### 5. User Not Found

Request:

```json
{
  "email": "unknown@test.com",
  "password": "123456789"
}
```

Response:

```json
{
  "message": "User not found"
}
```

---

### 6. Missing Request Body

Request:

```json
{}
```

Response:

```json
{
  "message": "Email and password are required"
}
```
---

## 5. Phone Login (Firebase) For firebase code contact bharathwajtp

**Endpoint**
POST /auth/phone-login

**Description**
Logs in user using Firebase phone authentication.

**Request Body**

```json
{
  "phone": "+919999999999"
}
```

**Notes**

- Demo number available for testing
- Default OTP: `123456`

**Response**

{
"user": {
"phone": "+919999999999",
"profilePic": "https://ui-avatars.com/api/?name={Username}",
"authProvider": "phone",
"isVerified": true,
"status": "offline",
"\_id": "69bd3774620bc0b2c0c091c0",
"createdAt": "2026-03-20T12:03:00.792Z",
"updatedAt": "2026-03-20T12:03:00.792Z",
"\_\_v": 0
},
"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YmQzNzc0NjIwYmMwYjJjMGMwOTFjMCIsImlhdCI6MTc3NDAwODE4MCwiZXhwIjoxNzc0NjEyOTgwfQ.8Y9vv8fYQgn3KHdu57HysHsAyLdr8gnAJAL3oTxpkls",
"isProfileComplete": false
}

---

## 6. Google Login

**Endpoint**
POST /auth/google-login

**Description**
Logs in user using Google authentication.

**Request Body**

{
"token": "google_oauth_token"
}

**Response**

{
    "user": {
        "_id": "69c0e1a4bd3cf3c0dfeb8da0",
        "name": "demo1",
        "email": "demo1@gmail.com",
        "profilePic": "https://lh3.googleusercontent.com/a/ACg8ocLvq9ruXTBL0Btd4OBUCoTKcIxwgexaijl1MWeJ_7OuvmPVlJ89=s96-c",
        "authProvider": "google",
        "isVerified": true,
        "status": "offline",
        "createdAt": "2026-03-23T06:45:56.552Z",
        "updatedAt": "2026-03-23T06:45:56.552Z",
        "__v": 0
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5YzBlMWE0YmQzY2YzYzBkZmViOGRhMCIsImlhdCI6MTc3NDI1MDAxNSwiZXhwIjoxNzc0ODU0ODE1fQ.jtZshyjudAvxjhdluPnIQnnbZGgAo2sQSI-O8DfQFmg",
    "isProfileComplete": false
}

## 7. Create Profile

**Endpoint**  
POST /auth/create-profile

**Description**  
Creates profile for authenticated user after login/signup.

**Headers**

Authorization: Bearer <token>  
Content-Type: multipart/form-data

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| name | Text | Yes | User display name |
| profilePic | File | No | Profile picture |
| status | Text | No | User about/status |
| userId | Text | Yes | Authenticated user id |

**Example Request**

name = Demo User  
status = Hey there! I'm using Chatterly  
profilePic = image.jpg  
userId = 69c4cfee4ff8fc267d58530a  

---

### Success Response (200)

```json
{
  "message": "Profile created successfully",
  "user": {
    "_id": "69c51adb42b288ae32118f51",
    "name": "Bharath",
    "email": "demo@test.com",
    "profilePic": "https://....jpg",
    "status": "Hello",
    "isProfileComplete": true
  }
}
```

---

### Validation Errors

**1. Missing name**

```json
{
  "message": "Name is required"
}
```

**2. Missing Authorization Token**

```json
{
  "message": "Unauthorized"
}
```

**3. Invalid image format**

```json
{
  "message": "Only image files allowed"
}
```

**4. File size exceeds limit**

```json
{
  "message": "File size exceeds limit"
}
```

---

### Notes

- Bearer Token required
- Supports `multipart/form-data`
- Profile picture upload optional
- Name field mandatory
- Creates profile only once for new users

## 8. Update Profile

**Endpoint**  
PATCH /auth/update-profile

**Description**  
Updates authenticated user profile details.

**Headers**

Authorization: Bearer <token>  
Content-Type: multipart/form-data

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| name | Text | No | Update display name |
| email | Text | No | Update email address |
| phone | Text | No | Update phone number |
| status | Text | No | Update user status/about |
| profilePic | File | No | Upload new profile image |
| removeProfilePic | Boolean | No | true removes existing profile picture |
| darkMode | Boolean | No | Enable or disable dark mode preference |

Example:

name = Vikram  
email = test@update.com  
phone = +911234567899  
status = My Coding  
profilePic = image file  
removeProfilePic = true
darkMode = true

**Success Response (200)**

```json
{
  "message": "Profile updated successfully",
  "user": {
    "_id": "69e72c7addf28cd247bd4ef1",
    "name": "Vikram",
    "email": "test@update.com",
    "phone": "+911234567899",
    "status": "My Coding",
    "profilePic": "https://....png",
    "isVerified": true,
    "settings": {
      "darkMode": true
    }
  }
}
```

**Validation Errors**

Unauthorized request:

```json
{
  "message": "Unauthorized"
}
```

Invalid email:

```json
{
  "message": "Invalid email format"
}
```

Invalid phone:

```json
{
  "message": "Invalid phone number"
}
```

Unsupported image type:

```json
{
  "message": "Only image files allowed"
}
```

Large file upload:

```json
{
  "message": "File size must be less than 2MB"
}
```

```json
{
    "success": true,
    "data": [
        {
            "_id": "6a16ccb78139bea4c5908c4e",
            "type": "group",
            "groupName": "Test man",
            "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/1779879091073-2 (1).png",
            "description": "My first group1",
            "participants": [
                {
                    "user": {
                        "_id": "69e72c7addf28cd247bd4ef1",
                        "name": "Vikra",
                        "profilePic": ""
                    },
                    "role": "admin",
                    "joinedAt": "2026-05-27T10:51:35.112Z"
                },
                {
                    "user": {
                        "_id": "69e72c7eddf28cd247bd4ef4",
                        "name": "jo",
                        "profilePic": "https://ui-avatars.com/api/?name=User"
                    },
                    "role": "member",
                    "joinedAt": "2026-05-27T10:51:35.113Z"
                },
                {
                    "user": {
                        "_id": "69e71ce04655b3c65c3bbb5a",
                        "name": "Pradeep",
                        "profilePic": "https://ui-avatars.com/api/?name=User"
                    },
                    "role": "member",
                    "joinedAt": "2026-05-27T10:51:35.113Z"
                },
                {
                    "user": {
                        "_id": "69d75d236f48c9b045d574b6",
                        "name": "Ragu",
                        "profilePic": "https://ui-avatars.com/api/?name=User"
                    },
                    "role": "member",
                    "joinedAt": "2026-06-01T07:14:50.714Z"
                }
            ],
            "lastMessage": null,
            "unreadCount": 0,
            "updatedAt": "2026-06-01T07:14:50.715Z"
        },
        {
            "_id": "6a0bd6bf5fbd42f87e0a23ff",
            "participants": [
                {
                    "user": "69e72c7addf28cd247bd4ef1",
                    "archived": false,
                    "blocked": false,
                    "markedUnread": true,
                    "markedUnreadAt": "2026-05-28T02:16:39.873Z",
                    "_id": "6a0bd6bf5fbd42f87e0a2400"
                },
                {
                    "user": "69e72c7eddf28cd247bd4ef4",
                    "archived": false,
                    "blocked": false,
                    "markedUnread": true,
                    "markedUnreadAt": "2026-05-28T02:15:48.450Z",
                    "_id": "6a0bd6bf5fbd42f87e0a2401"
                }
            ],
            "lastMessage": "6a17a448bb7be40e7bc286c8",
            "createdAt": "2026-05-19T03:19:27.974Z",
            "updatedAt": "2026-05-28T02:16:39.873Z",
            "__v": 0,
            "unreadMessages": [],
            "unreadCount": 0,
            "type": "chat"
        }
    ]
}
```

**Notes**

- Bearer Token required
- Accepts multipart/form-data only
- All fields optional (partial update supported)
- `removeProfilePic=true` removes existing profile picture
- Email and phone should be validated before update
- `darkMode=true` enables dark mode preference for the authenticated user

## 9. Sync Contacts

**Endpoint**  
POST /user/syncContacts

**Description**  
Syncs device contacts and returns registered and unregistered users.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| contacts | Array[String] | Yes | List of phone numbers |

Example:

```json
{
  "contacts": [
    "+919999999999",
    "+919999999998",
    "+919999999997"
  ]
}
```

**Success Response (200)**

```json
{
  "message": "Contact sync successful",
  "registered": [
    {
      "_id": "69cb5c83757a070378d3cae4",
      "phone": "+919999999999",
      "name": "User One",
      "profilePic": "https://..."
    }
  ],
  "unRegistered": [
    "+919999999998",
    "+919999999997"
  ]
}
```

**Validation Errors**

Missing contacts:

```json
{
  "message": "Contacts array required"
}
```

Empty contacts array:

```json
{
  "message": "Contacts cannot be empty"
}
```

Invalid phone number:

```json
{
  "message": "Invalid phone format"
}
```

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Expired token:

```json
{
  "message": "Invalid token"
}
```

**Notes**

- Bearer Token required
- Contacts must be sent as array
- Supports multiple phone numbers
- Returns registered and unregistered users separately

## 10. Start Chat

**Endpoint**  
POST /chats/start

**Description**  
Creates or starts a chat between authenticated user and another user.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiverId | String | Yes | Receiver user ID |

Example:

```json
{
  "receiverId": "69e72c7eddf28cd247bd4ef4"
}
```

**Success Response (200)**

```json
{
  "message": "Chat created",
  "chat": {
    "_id": "6a0bd6bf5fbd42f87e0a23ff",
    "participants": [
      {
        "user": {
          "_id": "69e72c7addf28cd247bd4ef1",
          "name": "User1"
        }
      },
      {
        "user": {
          "_id": "69e72c7eddf28cd247bd4ef4",
          "name": "User2"
        }
      }
    ],
    "createdAt": "2026-05-19T03:19:27.974Z"
  }
}
```

**Validation Errors**

Missing receiverId:

```json
{
  "message": "Receiver ID is required"
}
```

Invalid receiverId:

```json
{
  "message": "Invalid user id"
}
```

Unauthorized request:

```json
{
  "message": "Unauthorized"
}
```

Starting chat with self:

```json
{
  "message": "Cannot create chat with yourself"
}
```

User not found:

```json
{
  "message": "Receiver not found"
}
```

**Notes**

- Bearer token mandatory
- receiverId must be valid MongoDB ObjectId
- Existing chat may be returned instead of creating new chat
- Authenticated user cannot start chat with self

## 11. Send Message

**Endpoint**  
POST /chats/send

**Description**  
Sends text message to another user. Also supports replying to an existing message.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiverId | String | Yes | Receiver user ID |
| encryptedContent | String | Yes | Message content |
| replyTo | String | No | Existing message ID for reply |

Example (Normal Message):

```json
{
  "receiverId": "69e72c7eddf28cd247bd4ef4",
  "encryptedContent": "Hello"
}
```

Example (Reply Message):

```json
{
  "receiverId": "69e72c7eddf28cd247bd4ef4",
  "encryptedContent": "Okay",
  "replyTo": "6a0bd78e5fbd42f87e0a240d"
}
```

**Success Response (200)**

```json
{
  "message": "Message sent",
  "data": {
    "_id": "6a0bd86a5fbd42f87e0a2415",
    "chatId": "6a0bd6bf5fbd42f87e0a23ff",
    "sender": "69e72c7addf28cd247bd4ef1",
    "receiver": "69e72c7eddf28cd247bd4ef4",
    "encryptedContent": "Hello",
    "messageType": "text",
    "replyTo": null,
    "status": "sent",
    "createdAt": "2026-05-19T03:26:34.495Z"
  }
}
```

Reply Response Example:

```json
{
  "replyTo": "6a0bd78e5fbd42f87e0a240d",
  "replyPreview": {
      "content": "Previous message",
      "messageType": "text"
  }
}
```

**Validation Errors**

Missing receiverId:

```json
{
  "message": "Receiver ID is required"
}
```

Missing content:

```json
{
  "message": "Message content required"
}
```

Unauthorized request:

```json
{
  "message": "Unauthorized"
}
```

Invalid reply message:

```json
{
  "message": "Reply message not found"
}
```

Receiver not found:

```json
{
  "message": "Receiver not found"
}
```

Blocked user:

```json
{
  "message": "Cannot send message to blocked user"
}
```

**Notes**

- Bearer token mandatory
- Supports normal text messages
- Supports reply messages using `replyTo`
- `replyTo` must contain valid message ID
- Message status initially stored as `sent`

## 12. Get Messages

**Endpoint**  
GET /chats/messages/:chatId

**Description**  
Fetches all messages from a specific chat for authenticated user.

**Headers**

Authorization: Bearer <token>

**Path Parameters**

| Parameter | Type | Required | Description |
|-----------|------|-----------|-------------|
| chatId | String | Yes | Chat ID to fetch messages |

Example:

```http
GET /chats/messages/6a0bd6bf5fbd42f87e0a23ff
```

**Success Response (200)**

```json
{
  "message": "Messages fetched",
  "data": [
    {
      "_id": "6a0bd8b75fbd42f87e0a241c",
      "chatId": "6a0bd6bf5fbd42f87e0a23ff",
      "content": "Hello",
      "messageType": "text",
      "sender": {
        "_id": "69e72c7addf28cd247bd4ef1",
        "name": "User1"
      },
      "receiver": {
        "_id": "69e72c7eddf28cd247bd4ef4",
        "name": "User2"
      },
      "status": "sent",
      "createdAt": "2026-05-19T03:27:51.377Z"
    }
  ]
}
```

Reply Message Example:

```json
{
  "replyTo": "6a0bd78e5fbd42f87e0a240d",
  "replyPreview": {
      "content": "Previous message",
      "messageType": "text"
  }
}
```

Pinned Message Example:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-05-19T04:00:44.901Z"
}
```

Forwarded Message Example:

```json
{
  "isForwarded": true,
  "forwardedFrom": "69e72c7addf28cd247bd4ef1"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Invalid chatId:

```json
{
  "message": "Invalid chat id"
}
```

Chat not found:

```json
{
  "message": "Chat not found"
}
```

No messages:

```json
{
  "message": "Messages fetched",
  "data": []
}
```

**Notes**

- Bearer token required
- chatId must be valid MongoDB ObjectId
- Returns text, image, video, audio and file messages
- Supports reply messages
- Supports forwarded messages
- Supports pinned messages
- Empty array returned if no messages available

## 13. Get Chat List

**Endpoint**  
GET /chats/list

**Description**  
Fetches all chats available for authenticated user including unread count and last message.

**Headers**

Authorization: Bearer <token>

**Request**

No request body required.

Example:

```http
GET /chats/list
```

**Success Response (200)**

```json
{
  "data": [
    {
      "_id": "6a0bd6bf5fbd42f87e0a23ff",
      "participants": [
        {
          "user": "69e72c7addf28cd247bd4ef1",
          "archived": false,
          "blocked": false
        },
        {
          "user": "69e72c7eddf28cd247bd4ef4",
          "archived": false,
          "blocked": false
        }
      ],
      "lastMessage": "6a0bd8b75fbd42f87e0a241c",
      "unreadCount": 0,
      "createdAt": "2026-05-19T03:19:27.974Z",
      "updatedAt": "2026-05-19T03:27:51.379Z"
    }
  ]
}
```

Empty Chat List Example:

```json
{
  "data": []
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Expired token:

```json
{
  "message": "Invalid token"
}
```

Server error:

```json
{
  "message": "Failed to fetch chats"
}
```

**Notes**

- Bearer token mandatory
- Returns all active chats for authenticated user
- Includes unread message count
- Includes archived/block status
- Includes last message reference
- Empty array returned if user has no chats
- Chats may be sorted by latest activity

## 14. Archive Chat

**Endpoint**  
POST /chats/archive

**Description**  
Archives a chat for authenticated user. Archived chats are hidden from active chat list.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| chatId | String | Yes | Chat ID to archive |

Example:

```json
{
  "chatId": "6a0bd6bf5fbd42f87e0a23ff"
}
```

**Success Response (200)**

```json
{
  "message": "Chat archived"
}
```

**Validation Errors**

Missing chatId:

```json
{
  "message": "Chat ID is required"
}
```

Invalid chatId:

```json
{
  "message": "Invalid chat id"
}
```

Unauthorized request:

```json
{
  "message": "Unauthorized"
}
```

Chat not found:

```json
{
  "message": "Chat not found"
}
```

Already archived:

```json
{
  "message": "Chat already archived"
}
```

**Notes**

- Bearer token mandatory
- chatId must be valid MongoDB ObjectId
- Archived chats may not appear in normal chat list
- User can restore chat using Unarchive API
- Archive affects only authenticated user's view

## 15. Unarchive Chat

**Endpoint**  
POST /chats/unarchive

**Description**  
Restores an archived chat back to active chat list for authenticated user.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| chatId | String | Yes | Chat ID to unarchive |

Example:

```json
{
  "chatId": "6a0bd6bf5fbd42f87e0a23ff"
}
```

**Success Response (200)**

```json
{
  "message": "Chat unarchived"
}
```

**Validation Errors**

Missing chatId:

```json
{
  "message": "Chat ID is required"
}
```

Invalid chatId:

```json
{
  "message": "Invalid chat id"
}
```

Unauthorized request:

```json
{
  "message": "Unauthorized"
}
```

Chat not found:

```json
{
  "message": "Chat not found"
}
```

Chat not archived:

```json
{
  "message": "Chat is not archived"
}
```

**Notes**

- Bearer token mandatory
- chatId must be valid MongoDB ObjectId
- Restores archived chat to active chat list
- Only affects authenticated user's chat view
- Previously archived chats become visible again

## 16. Save Token

**Endpoint**  
POST /chats/save-token

**Description**  
Stores Firebase Cloud Messaging (FCM) token for authenticated user to receive push notifications.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| userId | String | Yes | Authenticated user ID |
| fcmToken | String | Yes | Firebase notification token |

Example:

```json
{
  "userId": "69d6092bedcb7fa161565f78",
  "fcmToken": "fcm_device_token_here"
}
```

**Success Response (200)**

```json
{
  "success": true
}
```

**Validation Errors**

Missing userId:

```json
{
  "message": "User ID is required"
}
```

Missing fcmToken:

```json
{
  "message": "FCM token is required"
}
```

Unauthorized request:

```json
{
  "message": "Unauthorized"
}
```

Invalid userId:

```json
{
  "message": "Invalid user id"
}
```

User not found:

```json
{
  "message": "User not found"
}
```

**Notes**

- Bearer token mandatory
- userId must be valid MongoDB ObjectId
- fcmToken used for push notifications
- Existing token may be replaced with new token
- Token updates when user reinstalls app or changes device

## 17. Notify

**Endpoint**  
POST /chats/notify

**Description**  
Sends push notification to another user using Firebase Cloud Messaging (FCM).

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiverId | String | Yes | Receiver user ID |
| senderId | String | Yes | Sender user ID |
| body | String | Yes | Notification message |
| redir | String | No | Redirect URL or app route |

Example:

```json
{
  "receiverId": "69d6092bedcb7fa161565f78",
  "senderId": "69d6092bedcb7fa161565f79",
  "body": "Notification from Chatterly",
  "redir": "/chat/69d6092bedcb7fa161565f78"
}
```

**Success Response (200)**

```json
{
  "success": true,
  "message": "Notification sent"
}
```

**Validation Errors**

Missing receiverId:

```json
{
  "message": "Receiver ID is required"
}
```

Missing senderId:

```json
{
  "message": "Sender ID is required"
}
```

Missing body:

```json
{
  "message": "Notification body is required"
}
```

Invalid receiverId:

```json
{
  "message": "Invalid receiver id"
}
```

Invalid senderId:

```json
{
  "message": "Invalid sender id"
}
```

Unauthorized request:

```json
{
  "message": "Unauthorized"
}
```

Receiver not found:

```json
{
  "message": "Receiver not found"
}
```

Notification send failed:

```json
{
  "message": "Failed to send notification"
}
```

**Notes**

- Bearer token mandatory
- receiverId and senderId must be valid MongoDB ObjectIds
- Uses Firebase Cloud Messaging service
- redir field optional for deep linking
- Receiver must have valid FCM token saved

## 18. Search User

**Endpoint**  
GET /chats/contacts/search?q=value

**Description**  
Search registered contacts/users by name or phone number.

**Headers**

Authorization: Bearer <token>

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|-----------|-------------|
| q | String | Yes | Search keyword (name or phone number) |

**Example Request**

GET /chats/contacts/search?q=pradeep

**Success Response (200)**

```json
[
  {
    "_id": "69d75d0a6f48c9b045d574b3",
    "name": "Pradeep",
    "phone": "+912222222222"
  }
]
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing query parameter:

```json
{
  "message": "Search query is required"
}
```

Invalid query:

```json
{
  "message": "Invalid search input"
}
```

No matching users:

```json
[]
```

**Notes**

- Bearer Token required
- Query parameter `q` is mandatory
- Supports partial search by name or phone number
- Returns empty array if no users found
- Only registered users are returned

## 19. Delete Message For Me

**Endpoint**  
POST /message/delete/me

**Description**  
Deletes a message only for the authenticated user. Other chat participants can still see the message.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| messageId | String | Yes | Message ID to delete |

Example:

```json
{
  "messageId": "69e74b3496fffa5257e507ec"
}
```

**Success Response (200)**

```json
{
  "message": "Message deleted for you"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing messageId:

```json
{
  "message": "Message ID is required"
}
```

Invalid messageId:

```json
{
  "message": "Invalid message id"
}
```

Message not found:

```json
{
  "message": "Message not found"
}
```

Already deleted:

```json
{
  "message": "Message already deleted"
}
```

**Notes**

- Bearer Token required
- Deletes message only for current authenticated user
- Other users in chat can still view message
- messageId must be valid MongoDB ObjectId
- Deleted message may still exist in database

## 20. Delete Message For Everyone

**Endpoint**  
POST /message/delete/everyone

**Description**  
Deletes a message for all chat participants. The message will no longer be visible to sender and receiver.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| messageId | String | Yes | Message ID to delete for everyone |

Example:

```json
{
  "messageId": "69e74885a2e61cca72996ae5"
}
```

**Success Response (200)**

```json
{
  "message": "Message deleted for everyone"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing messageId:

```json
{
  "message": "Message ID is required"
}
```

Invalid messageId:

```json
{
  "message": "Invalid message id"
}
```

Message not found:

```json
{
  "message": "Message not found"
}
```

Deletion not allowed:

```json
{
  "message": "Cannot delete this message"
}
```

Already deleted:

```json
{
  "message": "Message already deleted"
}
```

**Notes**

- Bearer Token required
- Deletes message for both sender and receiver
- Only message owner may delete for everyone (if implemented)
- messageId must be valid MongoDB ObjectId
- Deleted message may remain in database with deleted status

## 21. Delete Chat

**Endpoint**  
POST /delete

**Description**  
Deletes or archives a chat for the authenticated user. The chat may be hidden from the user's chat list.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| chatId | String | Yes | Chat ID to delete/archive |

Example:

```json
{
  "chatId": "69e72cb3ddf28cd247bd4ef8"
}
```

**Success Response (200)**

```json
{
  "message": "Chat deleted (archived)"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing chatId:

```json
{
  "message": "Chat ID is required"
}
```

Invalid chatId:

```json
{
  "message": "Invalid chat id"
}
```

Chat not found:

```json
{
  "message": "Chat not found"
}
```

Already deleted:

```json
{
  "message": "Chat already deleted"
}
```

**Notes**

- Bearer Token required
- chatId must be valid MongoDB ObjectId
- Deleted chat may only be archived, not permanently removed
- Chat deletion affects authenticated user view only (if archive-based implementation)
- Existing messages may still remain in database

## 22. Send Image

**Endpoint**  
POST /chats/send-media

**Description**  
Uploads and sends an image message to another user.

**Headers**

Authorization: Bearer <token>  
Content-Type: multipart/form-data

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiverId | String | Yes | Receiver user ID |
| caption | Text | No | Image caption/message |
| media | File | Yes | Image file upload |

Example:

receiverId = 69e72c7eddf28cd247bd4ef4  
caption = Hello image  
media = image.jpg

**Success Response (200)**

```json
{
    "message": "Media sent",
    "data": {
        "chatId": "6a294b44314f7d3afb0cae7e",
        "groupId": null,
        "sender": "69e72c7addf28cd247bd4ef1",
        "receiver": "69e71ce04655b3c65c3bbb5a",
        "callId": null,
        "callStatus": null,
        "content": "",
        "encryptedContent": "",
        "messageType": "image",
        "replyTo": null,
        "replyPreview": {
            "content": "",
            "sender": null,
            "messageType": "text",
            "mediaUrl": ""
        },
        "isForwarded": false,
        "forwardedFrom": null,
        "mediaType": "image",
        "mediaUrl": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/images/860f57d5-deb0-4705-b1a5-d18592641d3c.jpg",
        "thumbnailUrl": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/thumbs/860f57d5-deb0-4705-b1a5-d18592641d3c.jpg",
        "caption": "Image",
        "audioDuration": 0,
        "waveform": [],
        "mediaSize": 135120,
        "fileName": "Luffy wallpaper.jpeg",
        "filePath": "",
        "fileType": "image/jpeg",
        "fileSize": 135120,
        "status": "sent",
        "deliveredAt": null,
        "disappearAfter": "off",
        "expiresAt": null,
        "tempId": "28e7c86d-1105-4b74-94c6-03752aba9e03",
        "deletedFor": [],
        "isDeleted": false,
        "deletedAt": null,
        "isEdited": false,
        "isPinned": false,
        "pinnedBy": null,
        "pinnedAt": null,
        "_id": "6a5e01710a5ec1dd628b0f2f",
        "readBy": [],
        "createdAt": "2026-07-20T11:07:29.424Z",
        "updatedAt": "2026-07-20T11:07:29.424Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing receiverId:

```json
{
  "message": "Receiver ID is required"
}
```

Missing media file:

```json
{
  "message": "Media file required"
}
```

Unsupported file type:

```json
{
  "message": "Only image files allowed"
}
```

Large file upload:

```json
{
  "message": "File size exceeds limit"
}
```

Invalid receiverId:

```json
{
  "message": "Receiver not found"
}
```

**Notes**

- Bearer Token required
- Accepts multipart/form-data only
- Supports image upload with optional caption
- Thumbnail URL generated automatically
- Uploaded images stored in AWS S3
- receiverId must be valid MongoDB ObjectId

## 23. Send Video

**Endpoint**  
POST /chats/send-media

**Description**  
Uploads and sends a video message to another user.

**Headers**

Authorization: Bearer <token>  
Content-Type: multipart/form-data

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiverId | String | Yes | Receiver user ID |
| caption | Text | No | Video caption/message |
| media | File | Yes | Video file upload |

Example:

receiverId = 69e72c7eddf28cd247bd4ef4  
caption = Sample video  
media = video.mp4

**Success Response (200)**

```json
{
    "message": "Media sent",
    "data": {
        "chatId": "6a294b44314f7d3afb0cae7e",
        "groupId": null,
        "sender": "69e72c7addf28cd247bd4ef1",
        "receiver": "69e71ce04655b3c65c3bbb5a",
        "callId": null,
        "callStatus": null,
        "content": "",
        "encryptedContent": "",
        "messageType": "video",
        "replyTo": null,
        "replyPreview": {
            "content": "",
            "sender": null,
            "messageType": "text",
            "mediaUrl": ""
        },
        "isForwarded": false,
        "forwardedFrom": null,
        "mediaType": "video",
        "mediaUrl": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/media/original/cea6c917-c0b1-4419-9269-c8bd5c06345d.mp4",
        "thumbnailUrl": "",
        "caption": "",
        "audioDuration": 0,
        "waveform": [],
        "mediaSize": 105207195,
        "fileName": "100MB_1080P_THETESTDATA.COM_mp4_new.mp4",
        "filePath": "",
        "fileType": "video/mp4",
        "fileSize": 105207195,
        "status": "sent",
        "deliveredAt": null,
        "disappearAfter": "off",
        "expiresAt": null,
        "tempId": "0a1c6771-8974-4a9d-ac10-1ea4fbc430e7",
        "deletedFor": [],
        "isDeleted": false,
        "deletedAt": null,
        "isEdited": false,
        "isPinned": false,
        "pinnedBy": null,
        "pinnedAt": null,
        "_id": "6a5e01f80a5ec1dd628b0f47",
        "readBy": [],
        "createdAt": "2026-07-20T11:09:44.973Z",
        "updatedAt": "2026-07-20T11:09:44.973Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing receiverId:

```json
{
  "message": "Receiver ID is required"
}
```

Missing media:

```json
{
  "message": "Media file required"
}
```

Unsupported file type:

```json
{
  "message": "Only video files allowed"
}
```

Large video upload:

```json
{
  "message": "File size exceeds limit"
}
```

Invalid receiverId:

```json
{
  "message": "Receiver not found"
}
```

**Notes**

- Bearer Token required
- Accepts multipart/form-data only
- Supports video upload with optional caption
- Thumbnail generated automatically for videos
- Uploaded videos stored in AWS S3
- receiverId must be valid MongoDB ObjectId
- Large videos may take longer to upload

## 24. Send Audio

**Endpoint**  
POST /chats/send-media

**Description**  
Uploads and sends an audio/voice message to another user.

**Headers**

Authorization: Bearer <token>  
Content-Type: multipart/form-data

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiverId | String | Yes | Receiver user ID |
| duration | Number | Yes | Audio duration in seconds |
| waveform | Array | No | Audio waveform values |
| media | File | Yes | Audio file upload |

Example:

receiverId = 69e72c7eddf28cd247bd4ef4  
duration = 7  
waveform = [2,4,3,5]  
media = audio.mp3

**Success Response (200)**

```json
{
    "message": "Media sent",
    "data": {
        "chatId": "6a294b44314f7d3afb0cae7e",
        "groupId": null,
        "sender": "69e72c7addf28cd247bd4ef1",
        "receiver": "69e71ce04655b3c65c3bbb5a",
        "callId": null,
        "callStatus": null,
        "content": "",
        "encryptedContent": "",
        "messageType": "audio",
        "replyTo": null,
        "replyPreview": {
            "content": "",
            "sender": null,
            "messageType": "text",
            "mediaUrl": ""
        },
        "isForwarded": false,
        "forwardedFrom": null,
        "mediaType": "audio",
        "mediaUrl": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/media/a387570a-4ca7-413e-a683-327db2c0d883.mp3",
        "thumbnailUrl": "",
        "caption": "",
        "audioDuration": 7,
        "waveform": [
            2,
            4,
            3,
            5
        ],
        "mediaSize": 28772354,
        "fileName": "sample-speech-30m.mp3",
        "filePath": "",
        "fileType": "audio/mpeg",
        "fileSize": 28772354,
        "status": "sent",
        "deliveredAt": null,
        "disappearAfter": "off",
        "expiresAt": null,
        "tempId": "93c4aaa0-7349-47c8-8854-592aa068505a",
        "deletedFor": [],
        "isDeleted": false,
        "deletedAt": null,
        "isEdited": false,
        "isPinned": false,
        "pinnedBy": null,
        "pinnedAt": null,
        "_id": "6a5e01ef0a5ec1dd628b0f44",
        "readBy": [],
        "createdAt": "2026-07-20T11:09:35.941Z",
        "updatedAt": "2026-07-20T11:09:35.941Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing receiverId:

```json
{
  "message": "Receiver ID is required"
}
```

Missing audio file:

```json
{
  "message": "Media file required"
}
```

Invalid audio format:

```json
{
  "message": "Only audio files allowed"
}
```

Missing duration:

```json
{
  "message": "Duration required"
}
```

Invalid receiverId:

```json
{
  "message": "Receiver not found"
}
```

Large file upload:

```json
{
  "message": "File size exceeds limit"
}
```

**Notes**

- Bearer Token required
- Accepts multipart/form-data only
- Supports voice/audio file uploads
- duration represents audio length in seconds
- waveform stores voice waveform data for UI display
- Uploaded audio files stored in AWS S3
- receiverId must be valid MongoDB ObjectId

## 25. Send File

**Endpoint**  
POST /chats/send-file

**Description**  
Uploads and sends files/documents to another user.

**Headers**

Authorization: Bearer <token>  
Content-Type: multipart/form-data

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiverId | String | Yes | Receiver user ID |
| file | File | Yes | File/document upload |

Example:

receiverId = 69e72c7eddf28cd247bd4ef4  
file = report.pdf

**Success Response (200)**

```json
{
  "message": "File sent successfully",
  "data": {
    "messageType": "file",
    "fileName": "report.pdf",
    "fileType": "application/pdf",
    "fileSize": 4065499,
    "mediaUrl": "https://....pdf",
    "status": "sent"
  }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing receiverId:

```json
{
  "message": "Receiver ID is required"
}
```

Missing file:

```json
{
  "message": "File upload required"
}
```

Invalid receiverId:

```json
{
  "message": "Receiver not found"
}
```

Unsupported file type:

```json
{
  "message": "File type not supported"
}
```

Large file upload:

```json
{
  "message": "File size exceeds limit"
}
```

**Notes**

- Bearer Token required
- Accepts multipart/form-data only
- Supports documents like PDF, DOCX, TXT, etc.
- Uploaded files stored in AWS S3
- fileName, fileType and fileSize returned in response
- receiverId must be valid MongoDB ObjectId
- Large files may take longer to upload

## 26. Get Files

**Endpoint**  
GET /chats/files/:chatId

**Description**  
Fetches all shared files/documents in a specific chat.

**Headers**

Authorization: Bearer <token>

**Path Params**

| Parameter | Type | Required | Description |
|-----------|------|-----------|-------------|
| chatId | String | Yes | Chat ID to retrieve shared files |

Example:

GET /chats/files/6a0bdd235fbd42f87e0a244a

**Success Response (200)**

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "messageType": "file",
      "fileName": "S_5_1.pdf",
      "fileType": "application/pdf",
      "fileSize": 4065499,
      "mediaUrl": "https://....pdf",
      "createdAt": "2026-05-19T03:46:59.832Z"
    }
  ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Invalid chatId:

```json
{
  "message": "Invalid chat id"
}
```

Chat not found:

```json
{
  "message": "Chat not found"
}
```

User not authorized:

```json
{
  "message": "Access denied"
}
```

No shared files:

```json
{
  "success": true,
  "count": 0,
  "data": []
}
```

**Notes**

- Bearer Token required
- chatId must be valid MongoDB ObjectId
- Returns only shared files/documents in selected chat
- Response includes file type, file size and download URL
- Empty array returned if no files shared
- User must be participant of chat

## 27. Download File

**Endpoint**  
GET /chats/download/:id

**Description**  
Generates downloadable URL for shared file/message attachment.

**Headers**

Authorization: Bearer <token>

**Path Params**

| Parameter | Type | Required | Description |
|-----------|------|-----------|-------------|
| id | String | Yes | File message ID |

Example:

GET /chats/download/6a0bdd335fbd42f87e0a244e

**Success Response (200)**

```json
{
  "success": true,
  "downloadUrl": "https://chatterly-media-dev-001.s3...."
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Invalid messageId:

```json
{
  "message": "Invalid message id"
}
```

Message not found:

```json
{
  "message": "File message not found"
}
```

No file attached:

```json
{
  "message": "No downloadable file available"
}
```

Access denied:

```json
{
  "message": "You are not authorized to access this file"
}
```

**Notes**

- Bearer Token required
- messageId must belong to file-type message
- Generates temporary AWS S3 signed URL
- Download links may expire after few minutes
- User must be participant of chat
- Used for downloading previously shared files/documents

## 28. Get Profile View

**Endpoint**  
GET /chats/profile/:userId

**Description**  
Fetches profile details of a user in chat.

**Headers**

Authorization: Bearer <token>

**Path Params**

| Parameter | Type | Required | Description |
|-----------|------|-----------|-------------|
| userId | String | Yes | Target user ID |

Example:

GET /chats/profile/69e72c7eddf28cd247bd4ef4

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "_id": "69e72c7eddf28cd247bd4ef4",
    "name": "jo",
    "profilePic": "https://....jpg",
    "status": "offline",
    "lastSeen": "2026-04-22T09:43:28.908Z",
    "online": false
  }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Invalid userId:

```json
{
  "message": "Invalid user id"
}
```

User not found:

```json
{
  "message": "User not found"
}
```

Access denied:

```json
{
  "message": "Access denied"
}
```

**Notes**

- Bearer Token required
- userId must be valid MongoDB ObjectId
- Returns profile image, status, online state and last seen
- Used in chat profile/info page
- Only accessible for authenticated users

## 29. Get Medias

**Endpoint**  
GET /chats/profile/:userId/media

**Description**  
Fetches all shared media (images, videos, audio) for a user/chat profile.

**Headers**

Authorization: Bearer <token>

**Path Params**

| Parameter | Type | Required | Description |
|-----------|------|-----------|-------------|
| userId | String | Yes | Target user ID |

Example:

GET /chats/profile/69e72c7eddf28cd247bd4ef4/media

**Success Response (200)**

```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "6a01ad2104964d060ae2ddef",
      "mediaType": "image",
      "mediaUrl": "https://....jpg",
      "caption": "Image",
      "mediaSize": 169222,
      "createdAt": "2026-05-11T10:19:13.174Z"
    }
  ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Invalid userId:

```json
{
  "message": "Invalid user id"
}
```

User not found:

```json
{
  "message": "User not found"
}
```

No media found:

```json
{
  "success": true,
  "count": 0,
  "data": []
}
```

Access denied:

```json
{
  "message": "Access denied"
}
```

**Notes**

- Bearer Token required
- userId must be valid MongoDB ObjectId
- Returns images, videos and audio shared in chats
- Empty array returned if no media available
- Used in chat profile → Media section
- Includes media URL, caption, size and upload date

## 30. Get Links

**Endpoint**  
GET /chats/profile/:userId/link

**Description**  
Fetches all shared links exchanged with a user.

**Headers**

Authorization: Bearer <token>

**Path Params**

| Parameter | Type | Required | Description |
|-----------|------|-----------|-------------|
| userId | String | Yes | Target user ID |

Example:

GET /chats/profile/69e72c7eddf28cd247bd4ef4/link

**Success Response (200)**

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "url": "https://www.example.com",
      "sender": "69e72c7addf28cd247bd4ef1",
      "createdAt": "2026-05-11T10:40:18.774Z"
    }
  ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Invalid userId:

```json
{
  "message": "Invalid user id"
}
```

User not found:

```json
{
  "message": "User not found"
}
```

No links found:

```json
{
  "success": true,
  "count": 0,
  "data": []
}
```

Access denied:

```json
{
  "message": "Access denied"
}
```

**Notes**

- Bearer Token required
- userId must be valid MongoDB ObjectId
- Returns only messages containing URLs/links
- Empty array returned if no links shared
- Used in chat profile → Links section
- Includes sender information and shared date

## 31. Forward Message

**Endpoint**  
POST /chats/forward

**Description**  
Forwards an existing message to another user/chat.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| originalMessageId | String | Yes | Message ID to forward |
| receiverId | String | Yes | Receiver user ID |

Example:

```json
{
  "originalMessageId": "6a0bc55fbef617c4c45fb0bc",
  "receiverId": "69e72c7eddf28cd247bd4ef4"
}
```

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "_id": "6a0bdfcd5fbd42f87e0a246b",
    "messageType": "audio",
    "isForwarded": true,
    "forwardedFrom": "69e72c7addf28cd247bd4ef1",
    "receiver": "69e72c7eddf28cd247bd4ef4",
    "status": "sent"
  }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing originalMessageId:

```json
{
  "message": "Message id is required"
}
```

Missing receiverId:

```json
{
  "message": "Receiver id is required"
}
```

Invalid messageId:

```json
{
  "message": "Invalid message id"
}
```

Message not found:

```json
{
  "message": "Original message not found"
}
```

Receiver not found:

```json
{
  "message": "Receiver not found"
}
```

Forwarding to self (if restricted):

```json
{
  "message": "Cannot forward message to yourself"
}
```

**Notes**

- Bearer Token required
- Supports forwarding text, image, video, audio and file messages
- Forwarded message stored with `isForwarded = true`
- Original sender preserved in `forwardedFrom`
- receiverId and originalMessageId must be valid MongoDB ObjectIds
- Creates new message entry in target chat

## 32. Pin Message

**Endpoint**  
POST /chats/pin

**Description**  
Pins a message in chat for quick access.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| messageId | String | Yes | Message ID to pin |

Example:

```json
{
  "messageId": "6a0bcad0bef617c4c45fb0d6"
}
```

**Success Response (200)**

```json
{
  "success": true,
  "message": "Message pinned"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing messageId:

```json
{
  "message": "Message id is required"
}
```

Invalid messageId:

```json
{
  "message": "Invalid message id"
}
```

Message not found:

```json
{
  "message": "Message not found"
}
```

Already pinned:

```json
{
  "message": "Message already pinned"
}
```

Access denied:

```json
{
  "message": "Not authorized to pin this message"
}
```

**Notes**

- Bearer Token required
- messageId must be valid MongoDB ObjectId
- Only chat participants can pin messages
- Pinned messages stored with `isPinned = true`
- Pin timestamp saved in `pinnedAt`
- Used for important messages in chat

## 33. Unpin Message

**Endpoint**  
POST /chats/unpin

**Description**  
Removes a pinned message from chat.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| messageId | String | Yes | Message ID to unpin |

Example:

```json
{
  "messageId": "6a0bcad0bef617c4c45fb0d6"
}
```

**Success Response (200)**

```json
{
  "success": true,
  "message": "Message unpinned"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing messageId:

```json
{
  "message": "Message id is required"
}
```

Invalid messageId:

```json
{
  "message": "Invalid message id"
}
```

Message not found:

```json
{
  "message": "Message not found"
}
```

Message not pinned:

```json
{
  "message": "Message is not pinned"
}
```

Access denied:

```json
{
  "message": "Not authorized to unpin this message"
}
```

**Notes**

- Bearer Token required
- messageId must be valid MongoDB ObjectId
- Only chat participants can unpin messages
- Unpin action updates `isPinned = false`
- `pinnedAt` and `pinnedBy` may be cleared after unpinning
- Used to remove messages from pinned list

## 34. Get Pinned Messages

**Endpoint**  
GET /chats/pinned/:chatId

**Description**  
Fetches all pinned messages for a specific chat.

**Headers**

Authorization: Bearer <token>

**Path Params**

| Parameter | Type | Required | Description |
|-----------|------|-----------|-------------|
| chatId | String | Yes | Chat ID |

Example:

GET /chats/pinned/6a0bd6bf5fbd42f87e0a23ff

**Success Response (200)**

```json
{
  "success": true,
  "data": [
    {
      "_id": "6a0bdfcd5fbd42f87e0a246b",
      "messageType": "audio",
      "isPinned": true,
      "pinnedBy": "69e72c7addf28cd247bd4ef1",
      "pinnedAt": "2026-05-19T04:00:44.900Z",
      "createdAt": "2026-05-19T03:58:05.374Z"
    }
  ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing chatId:

```json
{
  "message": "Chat id is required"
}
```

Invalid chatId:

```json
{
  "message": "Invalid chat id"
}
```

Chat not found:

```json
{
  "message": "Chat not found"
}
```

No pinned messages:

```json
{
  "success": true,
  "data": []
}
```

Access denied:

```json
{
  "message": "Not authorized to access this chat"
}
```

**Notes**

- Bearer Token required
- chatId must be valid MongoDB ObjectId
- Returns all pinned messages in selected chat
- Empty array returned if no messages are pinned
- Includes pin time (`pinnedAt`) and user who pinned (`pinnedBy`)
- Used for chat → pinned messages section

## 35. Mark Chat as Read

**Endpoint**  
POST /chats/mark-read

**Description**  
Marks all unread messages in a chat as read for the authenticated user.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| chatId | String | Yes | Chat ID to mark as read |

Example:

```json
{
  "chatId": "69e72cb3ddf28cd247bd4ef8"
}
```

**Success Response (200)**

```json
{
  "success": true,
  "message": "Chat marked as read"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing chatId:

```json
{
  "message": "Chat id is required"
}
```

Invalid chatId:

```json
{
  "message": "Invalid chat id"
}
```

Chat not found:

```json
{
  "message": "Chat not found"
}
```

User not part of chat:

```json
{
  "message": "Access denied"
}
```

Already marked as read:

```json
{
  "message": "Chat already marked as read"
}
```

**Notes**

- Bearer Token required
- chatId must be valid MongoDB ObjectId
- Marks unread messages as read for authenticated user
- Updates unread message count
- User must belong to the specified chat
- Used for chat open/read status tracking

## 36. Mark Chat as Unread

**Endpoint**  
PUT /chats/mark-unread

**Description**  
Marks a chat as unread for the authenticated user.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| chatId | String | Yes | Chat ID to mark as unread |

Example:

```json
{
  "chatId": "69e72cb3ddf28cd247bd4ef8"
}
```

**Success Response (200)**

```json
{
  "success": true,
  "message": "Chat marked as unread"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing chatId:

```json
{
  "message": "Chat id is required"
}
```

Invalid chatId:

```json
{
  "message": "Invalid chat id"
}
```

Chat not found:

```json
{
  "message": "Chat not found"
}
```

User not part of chat:

```json
{
  "message": "Access denied"
}
```

Already marked as unread:

```json
{
  "message": "Chat already marked as unread"
}
```

## 37. Start group chat

**Endpoint**  
POST /group/create

**Description**  
Creates a group for the authenticated user.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Requested Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupName | Text | Yes |  |
| description | Text | No |  |
| participants | Text | Yes |  |
| participants | Text | Yes |  |
| media | File | No |  |

Example:

groupName = test
description = Group testing
participants = 69e72c7eddf28cd247bd4ef4
participants = 69e71ce04655b3c65c3bbb5a
media = q.png

**Success Response (200)**

```json
{
    "success": true,
    "message": "Group created successfully",
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fc935da04e43f7f2beb9e",
        "groupName": "Test man",
        "description": "My first group1",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815516593810-2 (1).png",
        "createdBy": {
            "_id": "69e72c7addf28cd247bd4ef1",
            "name": "Vikra",
            "profilePic": ""
        },
        "participants": [
            {
                "user": {
                    "_id": "69e72c7eddf28cd247bd4ef4",
                    "name": "jo",
                    "phone": "+916666666666",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                },
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:43:17.181Z"
            },
            {
                "user": {
                    "_id": "69e71ce04655b3c65c3bbb5a",
                    "name": "Pradeep",
                    "phone": "+919999999999",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                },
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:43:17.181Z"
            },
            {
                "user": {
                    "_id": "69e72c7addf28cd247bd4ef1",
                    "name": "Vikra",
                    "phone": "+911234567899",
                    "profilePic": ""
                },
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:43:17.181Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T09:43:17.182Z",
        "updatedAt": "2026-06-15T09:43:17.182Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing required partcipants:

```json
{
    "success": false,
    "message": "Minimum 2 participants required"
}
```

Invalid groupName:

```json
{
    "success": false,
    "message": "Group name is required"
}
```

Invalid groupName length:

```json
{
    "success": false,
    "message": "Group name cannot exceed 50 characters"
}
```

## 38. Get group details

**Endpoint**
GET group/:groupId

**Description**
Get group details for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |

Example: 

GET /group/6a16c05a699f029220b3fee3

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fc9d38a3309125e91e82a",
        "groupName": "Test man",
        "description": "My first group1",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815167553943-2 (1).png",
        "createdBy": {
            "_id": "69e72c7addf28cd247bd4ef1",
            "name": "Vikra",
            "profilePic": ""
        },
        "participants": [
            {
                "user": {
                    "_id": "69e72c7eddf28cd247bd4ef4",
                    "name": "jo",
                    "phone": "+916666666666",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                },
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": {
                    "_id": "69e71ce04655b3c65c3bbb5a",
                    "name": "Pradeep",
                    "phone": "+919999999999",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                },
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": {
                    "_id": "69e72c7addf28cd247bd4ef1",
                    "name": "Vikra",
                    "phone": "+911234567899",
                    "profilePic": ""
                },
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T09:45:55.807Z",
        "updatedAt": "2026-06-15T09:45:55.807Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing groupId:

```json
{
    "success": false,
    "message": "Invalid group id"
}
```

## 39. Search groups

**Endpoint**
GET group/search?keyword=""

**Description**
Search groups for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| keyword | String | Yes |  |

Example:

keyword = T

**Success Response (200)**

```json
{
    "success": true,
    "data": [
        {
            "settings": {
                "onlyAdminsCanMessage": false,
                "onlyAdminsCanShareMedia": false
            },
            "_id": "6a2fc9d38a3309125e91e82a",
            "groupName": "Test man",
            "description": "My first group1",
            "rules": [
                ""
            ],
            "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815616753943-2 (1).png",
            "createdBy": "69e72c7addf28cd247bd4ef1",
            "participants": [
                {
                    "user": {
                        "_id": "69e72c7eddf28cd247bd4ef4",
                        "name": "jo",
                        "profilePic": "https://ui-avatars.com/api/?name=User"
                    },
                    "role": "member",
                    "isMuted": false,
                    "joinedAt": "2026-06-15T09:45:55.802Z"
                },
                {
                    "user": {
                        "_id": "69e71ce04655b3c65c3bbb5a",
                        "name": "Pradeep",
                        "profilePic": "https://ui-avatars.com/api/?name=User"
                    },
                    "role": "member",
                    "isMuted": false,
                    "joinedAt": "2026-06-15T09:45:55.802Z"
                },
                {
                    "user": {
                        "_id": "69e72c7addf28cd247bd4ef1",
                        "name": "Vikra",
                        "profilePic": ""
                    },
                    "role": "superadmin",
                    "isMuted": false,
                    "joinedAt": "2026-06-15T09:45:55.802Z"
                }
            ],
            "lastMessage": null,
            "createdAt": "2026-06-15T09:45:55.807Z",
            "updatedAt": "2026-06-15T09:45:55.807Z",
            "__v": 0
        }
    ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing keyword:

```json
{
    "success": false,
    "message": "Keyword required"
}
```

## 40. Assign moderator

**Endpoint**
POST group/assign-moderator

**Description**
Assign member as moderator by authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| userId | String | Yes |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
userId = 69e72c7eddf28cd247bd4ef4

**Success Response (200)**

```json
{
    "success": true,
    "message": "Moderator assigned successfully",
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fc9d38a3309125e91e82a",
        "groupName": "Test man",
        "description": "My first group1",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815167353943-2 (1).png",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": "69e72c7eddf28cd247bd4ef4",
                "role": "moderator",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e71ce04655b3c65c3bbb5a",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e72c7addf28cd247bd4ef1",
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T09:45:55.807Z",
        "updatedAt": "2026-06-15T10:08:30.597Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Not userId:

```json
{
    "success": false,
    "message": "User not found in group"
}
```

## 41. Remove moderator

**Endpoint**
POST group/remove-moderator

**Description**
Remove moderator to member by authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| userId | String | Yes |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
userId = 69e72c7eddf28cd247bd4ef4

**Success Response (200)**

```json
{
    "success": true,
    "message": "Moderator removed successfully",
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fc9d38a3309125e91e82a",
        "groupName": "Test man",
        "description": "My first group1",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815167523943-2 (1).png",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": "69e72c7eddf28cd247bd4ef4",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e71ce04655b3c65c3bbb5a",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e72c7addf28cd247bd4ef1",
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T09:45:55.807Z",
        "updatedAt": "2026-06-15T10:28:07.067Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Not userId:

```json
{
    "success": false,
    "message": "User not found in group"
}
```

## 42. Add participants

**Endpoint**
PUT group/add-participants

**Description**
Add participants by authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| participants | String | Yes |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
participants = [69d75d236f48c9b045d574b6,]

**Success Response (200)**

```json
{
    "success": true,
    "message": "Participants added successfully",
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fc9d38a3309125e91e82a",
        "groupName": "Test man",
        "description": "My first group1",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815176753943-2 (1).png",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": "69e72c7eddf28cd247bd4ef4",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e71ce04655b3c65c3bbb5a",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e72c7addf28cd247bd4ef1",
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69d75d236f48c9b045d574b6",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T10:32:39.722Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T09:45:55.807Z",
        "updatedAt": "2026-06-15T10:32:39.723Z",
        "__v": 1
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Not participants:

```json
{
    "success": false,
    "message": "Some users not found"
}
```

missing participants Id:

```json
{
    "success": false,
    "message": "Participants required"
}
```

## 43. Remove participant

**Endpoint**
PUT group/remove-participant

**Description**
Remove participant by authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| participantId | String | Yes |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
participantId = 69d75d236f48c9b045d574b6

**Success Response (200)**

```json
{
    "success": true,
    "message": "Participant removed successfully",
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fc9d38a3309125e91e82a",
        "groupName": "Test man",
        "description": "My first group1",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815136753943-2 (1).png",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": "69e72c7eddf28cd247bd4ef4",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e71ce04655b3c65c3bbb5a",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e72c7addf28cd247bd4ef1",
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T09:45:55.807Z",
        "updatedAt": "2026-06-15T10:39:11.977Z",
        "__v": 2
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Not participantId:

```json
{
    "success": false,
    "message": "Participant not found"
}
```

## 44. Get my groups

**Endpoint**
GET group/my-groups

**Description**
Get groups for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
|  |  |  |  |

Example:

GET group/my-groups

**Success Response (200)**

```json
{
    "success": true,
    "data": [
        {
            "settings": {
                "onlyAdminsCanMessage": false,
                "onlyAdminsCanShareMedia": false
            },
            "_id": "6a2fc9d38a3309125e91e82a",
            "groupName": "Test man",
            "description": "My first group1",
            "rules": [
                ""
            ],
            "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815126753943-2 (1).png",
            "createdBy": "69e72c7addf28cd247bd4ef1",
            "participants": [
                {
                    "user": {
                        "_id": "69e72c7eddf28cd247bd4ef4",
                        "name": "jo",
                        "profilePic": "https://ui-avatars.com/api/?name=User"
                    },
                    "role": "member",
                    "isMuted": false,
                    "joinedAt": "2026-06-15T09:45:55.802Z"
                },
                {
                    "user": {
                        "_id": "69e71ce04655b3c65c3bbb5a",
                        "name": "Pradeep",
                        "profilePic": "https://ui-avatars.com/api/?name=User"
                    },
                    "role": "member",
                    "isMuted": false,
                    "joinedAt": "2026-06-15T09:45:55.802Z"
                },
                {
                    "user": {
                        "_id": "69e72c7addf28cd247bd4ef1",
                        "name": "Vikra",
                        "profilePic": ""
                    },
                    "role": "superadmin",
                    "isMuted": false,
                    "joinedAt": "2026-06-15T09:45:55.802Z"
                }
            ],
            "lastMessage": null,
            "createdAt": "2026-06-15T09:45:55.807Z",
            "updatedAt": "2026-06-15T10:39:11.977Z",
            "__v": 2
        }
    ]
}
```

## 45. Leave group

**Endpoint**
PUT group/leave

**Description**
Leave group for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a

**Success Response (200)**

```json
{
    "success": true,
    "message": "Left group successfully"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 46. Update group

**Endpoint**
PUT group/update

**Description**
Update group for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| groupName | String | No |  |
| description | String | No |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
groupName = Testing
description = Updated Description


**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fc9d38a3309125e91e82a",
        "groupName": "Testing",
        "description": "Updated Description",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/178151689753943-2 (1).png",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": "69e72c7eddf28cd247bd4ef4",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e71ce04655b3c65c3bbb5a",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e72c7addf28cd247bd4ef1",
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T09:45:55.807Z",
        "updatedAt": "2026-06-15T10:57:23.548Z",
        "__v": 4
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 47. Change photo in group

**Endpoint**
PUT group/change-photo

**Description**
Change group photo for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| media | File | Yes |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
media = 2(1).png


**Success Response (200)**

```json
{
    "success": true,
    "message": "Photo updated",
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fc9d38a3309125e91e82a",
        "groupName": "Testing",
        "description": "Updated Description",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/178152143156952-2 (1).png",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": "69e72c7eddf28cd247bd4ef4",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e71ce04655b3c65c3bbb5a",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            },
            {
                "user": "69e72c7addf28cd247bd4ef1",
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T09:45:55.802Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T09:45:55.807Z",
        "updatedAt": "2026-06-15T11:04:18.927Z",
        "__v": 4
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Missing photo:

```json
{
    "success": false,
    "message": "Photo required"
}
```

## 48. Send message in group

**Endpoint**
POST group/send-message

**Description**
Send messages in group for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| content | String | Yes |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
content = Hello Group

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "chatId": null,
        "groupId": "6a2fc9d38a3309125e91e82a",
        "sender": "69e72c7addf28cd247bd4ef1",
        "receiver": null,
        "content": "Hello Group",
        "messageType": "text",
        "replyTo": null,
        "replyPreview": {
            "content": "",
            "sender": null,
            "messageType": "text",
            "mediaUrl": ""
        },
        "isForwarded": false,
        "forwardedFrom": null,
        "mediaType": null,
        "mediaUrl": "",
        "thumbnailUrl": "",
        "caption": "",
        "audioDuration": 0,
        "waveform": [],
        "mediaSize": 0,
        "fileName": "",
        "filePath": "",
        "fileType": "",
        "fileSize": 0,
        "status": "sent",
        "deletedFor": [],
        "isDeleted": false,
        "deletedAt": null,
        "isEdited": false,
        "isPinned": false,
        "pinnedBy": null,
        "pinnedAt": null,
        "_id": "6a2fde7f4a2db4a661328349",
        "readBy": [],
        "createdAt": "2026-06-15T11:14:07.316Z",
        "updatedAt": "2026-06-15T11:14:07.316Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Missing content:

```json
{
    "success": false,
    "message": "Message content required"
}
```

## 49. Send file in group

**Endpoint**
POST group/send-file

**Description**
Send files in group for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| file | File | Yes |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
file = Blank.pptx

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "chatId": null,
        "groupId": "6a2fc9d38a3309125e91e82a",
        "sender": "69e72c7addf28cd247bd4ef1",
        "receiver": null,
        "messageType": "file",
        "replyTo": null,
        "replyPreview": {
            "content": "",
            "sender": null,
            "messageType": "text",
            "mediaUrl": ""
        },
        "isForwarded": false,
        "forwardedFrom": null,
        "mediaType": null,
        "mediaUrl": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/group-files/17815223358378-Blank.pptx",
        "thumbnailUrl": "",
        "caption": "",
        "audioDuration": 0,
        "waveform": [],
        "mediaSize": 0,
        "fileName": "Blank.pptx",
        "filePath": "",
        "fileType": "",
        "fileSize": 29948,
        "status": "sent",
        "deletedFor": [],
        "isDeleted": false,
        "deletedAt": null,
        "isEdited": false,
        "isPinned": false,
        "pinnedBy": null,
        "pinnedAt": null,
        "_id": "6a2fdfa04a023f4327e28fd8",
        "readBy": [],
        "createdAt": "2026-06-15T11:18:56.442Z",
        "updatedAt": "2026-06-15T11:18:56.442Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Missing file:

```json
{
    "success": false,
    "message": "Media required"
}
```

## 50. Send media in group

**Endpoint**
POST group/send-media

**Description**
Send medias (Image, Video, Audio) in group for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body (form-data)**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| media | File | Yes |  |
| caption | String | No |  |

Example:

groupId = 6a2fc9d38a3309125e91e82a
media = file_example_MP3_1MG
caption = audio

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "chatId": null,
        "groupId": "6a2fc9d38a3309125e91e82a",
        "sender": "69e72c7addf28cd247bd4ef1",
        "receiver": null,
        "messageType": "audio",
        "replyTo": null,
        "replyPreview": {
            "content": "",
            "sender": null,
            "messageType": "text",
            "mediaUrl": ""
        },
        "isForwarded": false,
        "forwardedFrom": null,
        "mediaType": null,
        "mediaUrl": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/group-media/17815228348374-file_example_MP3_1MG.mp3",
        "thumbnailUrl": "",
        "caption": "audio",
        "audioDuration": 0,
        "waveform": [],
        "mediaSize": 0,
        "fileName": "file_example_MP3_1MG.mp3",
        "filePath": "",
        "fileType": "audio/mpeg",
        "fileSize": 1059386,
        "status": "sent",
        "deletedFor": [],
        "isDeleted": false,
        "deletedAt": null,
        "isEdited": false,
        "isPinned": false,
        "pinnedBy": null,
        "pinnedAt": null,
        "_id": "6a2fe19b4a023f4327e28fe4",
        "readBy": [],
        "createdAt": "2026-06-15T11:27:23.430Z",
        "updatedAt": "2026-06-15T11:27:23.430Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Missing file:

```json
{
    "success": false,
    "message": "Media required"
}
```

## 51. Get group messages

**Endpoint**
GET group/messages/:groupId

**Description**
Get messages in group for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |

Example:

GET group/messages/6a2fc9d38a3309125e91e82a

**Success Response (200)**

```json
{
    "success": true,
    "totalMessages": 2,
    "currentPage": 1,
    "totalPages": 1,
    "data": [
        {
            "replyPreview": {
                "content": "",
                "sender": null,
                "messageType": "text",
                "mediaUrl": ""
            },
            "_id": "6a2fe19b4a023f4327e28fe4",
            "chatId": null,
            "groupId": "6a2fc9d38a3309125e91e82a",
            "sender": {
                "_id": "69e72c7addf28cd247bd4ef1",
                "name": "Vikra",
                "profilePic": ""
            },
            "receiver": null,
            "messageType": "audio",
            "replyTo": null,
            "isForwarded": false,
            "forwardedFrom": null,
            "mediaType": null,
            "mediaUrl": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/group-media/1781522838374-file_example_MP3_1MG.mp3",
            "thumbnailUrl": "",
            "caption": "audio",
            "audioDuration": 0,
            "waveform": [],
            "mediaSize": 0,
            "fileName": "file_example_MP3_1MG.mp3",
            "filePath": "",
            "fileType": "audio/mpeg",
            "fileSize": 1059386,
            "status": "sent",
            "deletedFor": [],
            "isDeleted": false,
            "deletedAt": null,
            "isEdited": false,
            "isPinned": false,
            "pinnedBy": null,
            "pinnedAt": null,
            "readBy": [],
            "createdAt": "2026-06-15T11:27:23.430Z",
            "updatedAt": "2026-06-15T11:27:23.430Z",
            "__v": 0
        },
        {
            "replyPreview": {
                "content": "",
                "sender": null,
                "messageType": "text",
                "mediaUrl": ""
            },
            "_id": "6a2fdd674a2db4a661328343",
            "chatId": null,
            "groupId": "6a2fc9d38a3309125e91e82a",
            "sender": {
                "_id": "69e72c7addf28cd247bd4ef1",
                "name": "Vikra",
                "profilePic": ""
            },
            "receiver": null,
            "content": "Hello Group",
            "messageType": "text",
            "replyTo": null,
            "isForwarded": false,
            "forwardedFrom": null,
            "mediaType": null,
            "mediaUrl": "",
            "thumbnailUrl": "",
            "caption": "",
            "audioDuration": 0,
            "waveform": [],
            "mediaSize": 0,
            "fileName": "",
            "filePath": "",
            "fileType": "",
            "fileSize": 0,
            "status": "sent",
            "deletedFor": [],
            "isDeleted": false,
            "deletedAt": null,
            "isEdited": false,
            "isPinned": false,
            "pinnedBy": null,
            "pinnedAt": null,
            "readBy": [],
            "createdAt": "2026-06-15T11:09:27.563Z",
            "updatedAt": "2026-06-15T11:09:27.563Z",
            "__v": 0
        }
    ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 52. Delete group

**Endpoint**
GET group/delete/:groupId

**Description**
Permanently delete group by superadmin for everyone by authentication.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |

Example:

DELETE group/delete/6a2fc9d38a3309125e91e82a

**Success Response (200)**

```json
{
    "success": true,
    "message": "Group deleted successfully"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 53. Group settings

**Endpoint**
PUT group/admin-message

**Description**
Change to admin can only send message for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| onlyAdminsCanMessage | String | No |  |
| onlyAdminsCanShareMedia | String | No |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe
onlyAdminsCanMessage = true
onlyAdminsCanShareMedia = true

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "settings": {
            "onlyAdminsCanMessage": true,
            "onlyAdminsCanShareMedia": true
        },
        "_id": "6a2fe8214a023f4327e28ffe",
        "groupName": "Test man",
        "description": "My first group1",
        "rules": [
            ""
        ],
        "groupPhoto": "https://chatterly-media-dev-001.s3.ap-south-1.amazonaws.com/groups/17815244376070-2 (1).png",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": "69e72c7eddf28cd247bd4ef4",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T11:55:13.422Z"
            },
            {
                "user": "69e71ce04655b3c65c3bbb5a",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T11:55:13.422Z"
            },
            {
                "user": "69e72c7addf28cd247bd4ef1",
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T11:55:13.422Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T11:55:13.423Z",
        "updatedAt": "2026-06-15T11:57:06.506Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 54. Remove group photo

**Endpoint**
DELETE group/remove-photo

**Description**
Deletes group photo for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe

**Success Response (200)**

```json
{
    "success": true,
    "message": "Group photo removed successfully",
    "data": {
        "settings": {
            "onlyAdminsCanMessage": false,
            "onlyAdminsCanShareMedia": false
        },
        "_id": "6a2fe8214a023f4327e28ffe",
        "groupName": "Test man",
        "description": "My first group1",
        "rules": [
            ""
        ],
        "groupPhoto": "",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": "69e72c7eddf28cd247bd4ef4",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T11:55:13.422Z"
            },
            {
                "user": "69e71ce04655b3c65c3bbb5a",
                "role": "member",
                "isMuted": false,
                "joinedAt": "2026-06-15T11:55:13.422Z"
            },
            {
                "user": "69e72c7addf28cd247bd4ef1",
                "role": "superadmin",
                "isMuted": false,
                "joinedAt": "2026-06-15T11:55:13.422Z"
            }
        ],
        "lastMessage": null,
        "createdAt": "2026-06-15T11:55:13.423Z",
        "updatedAt": "2026-06-15T12:02:29.340Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 55. Add participant notification

**Endpoint**
POST notification/group-added

**Description**
Send added in group notifications for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiver | String | Yes |  |
| sender | String | Yes |  |
| groupId | String | Yes |  |
| groupNmae | String | Yes |  |

Example:

receiver = 69e72c7eddf28cd247bd4ef4
sender = 69e72c7addf28cd247bd4ef1
groupId = 6a2fe8214a023f4327e28ffe
groupName = Test man

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "receiver": "69e72c7eddf28cd247bd4ef4",
        "sender": "69e72c7addf28cd247bd4ef1",
        "group": "6a2fe8214a023f4327e28ffe",
        "type": "group_added",
        "message": "Added to Test man",
        "isRead": false,
        "_id": "6a2febbf4a023f4327e2901a",
        "createdAt": "2026-06-15T12:10:39.877Z",
        "updatedAt": "2026-06-15T12:10:39.877Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 56. Remove participant notification

**Endpoint**
Post notification/group-removed

**Description**
Send removed in group notifications for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiver | String | Yes |  |
| sender | String | Yes |  |
| groupId | String | Yes |  |
| groupNmae | String | Yes |  |

Example:

receiver = 69e72c7eddf28cd247bd4ef4
sender = 69e72c7addf28cd247bd4ef1
groupId = 6a2fe8214a023f4327e28ffe
groupName = Test man

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "receiver": "69e72c7eddf28cd247bd4ef4",
        "sender": "69e72c7addf28cd247bd4ef1",
        "group": "6a2fe8214a023f4327e28ffe",
        "type": "group_removed",
        "message": "Removed from Test man",
        "isRead": false,
        "_id": "6a2fedea4a023f4327e29023",
        "createdAt": "2026-06-15T12:19:54.201Z",
        "updatedAt": "2026-06-15T12:19:54.201Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 57. Start call

**Endpoint**  
POST /calls/start

**Description**  
Initiates call for the authenticated user.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| receiverId | audio | Yes | Initiate call |

Example:

```json
{
    "receiverId": "69d75d0a6f48c9b045d574b3",
    "type": "audio"
}
```

**Success Response (200)**

1. Receiver online
```json
{
    "success": true,
    "message": "Call initiated successfully",
    "data": {
        "call": {
            "caller": "69e72c7addf28cd247bd4ef1",
            "receiver": "69d75d0a6f48c9b045d574b3",
            "chat": "6a2923b9714ba99ad2e1f011",
            "type": "audio",
            "status": "calling",
            "startedAt": null,
            "endedAt": null,
            "duration": 0,
            "_id": "6a292481714ba99ad2e1f077",
            "createdAt": "2026-06-10T08:46:57.010Z",
            "updatedAt": "2026-06-10T08:46:57.010Z",
            "__v": 0
        },
        "chat": {
            "_id": "6a2923b9714ba99ad2e1f011",
            "participants": [
                {
                    "user": "69e72c7addf28cd247bd4ef1",
                    "archived": false,
                    "blocked": false,
                    "markedUnread": false,
                    "markedUnreadAt": null,
                    "_id": "6a2923b9714ba99ad2e1f012"
                },
                {
                    "user": "69d75d0a6f48c9b045d574b3",
                    "archived": false,
                    "blocked": false,
                    "markedUnread": false,
                    "markedUnreadAt": null,
                    "_id": "6a2923b9714ba99ad2e1f013"
                }
            ],
            "lastMessage": null,
            "createdAt": "2026-06-10T08:43:37.836Z",
            "updatedAt": "2026-06-10T08:43:37.836Z",
            "__v": 0
        }
    }
}
```

2. Receiver offline
```JSON
{
    "success": true,
    "message": "User is offline",
    "data": {
        "call": {
            "caller": "69e72c7addf28cd247bd4ef1",
            "receiver": "69e71ce04655b3c65c3bbb5a",
            "participants": [
                {
                    "user": "69e72c7addf28cd247bd4ef1",
                    "joinedAt": "2026-07-20T11:13:03.321Z",
                    "leftAt": null,
                    "isMuted": false,
                    "isOnHold": false
                },
                {
                    "user": "69e71ce04655b3c65c3bbb5a",
                    "joinedAt": "2026-07-20T11:13:03.321Z",
                    "leftAt": null,
                    "isMuted": false,
                    "isOnHold": false
                }
            ],
            "chat": "6a294b44314f7d3afb0cae7e",
            "type": "audio",
            "status": "missed",
            "screenSharingUser": null,
            "isScreenSharing": false,
            "startedAt": null,
            "endedAt": "2026-07-20T11:13:03.321Z",
            "duration": 0,
            "_id": "6a5e02bf0a5ec1dd628b0f54",
            "createdAt": "2026-07-20T11:13:03.324Z",
            "updatedAt": "2026-07-20T11:13:03.324Z",
            "__v": 0
        },
        "chat": {
            "_id": "6a294b44314f7d3afb0cae7e",
            "participants": [
                {
                    "user": "69e72c7addf28cd247bd4ef1",
                    "archived": false,
                    "blocked": false,
                    "markedUnread": false,
                    "markedUnreadAt": null,
                    "_id": "6a294b44314f7d3afb0cae7f"
                },
                {
                    "user": "69e71ce04655b3c65c3bbb5a",
                    "archived": false,
                    "blocked": false,
                    "markedUnread": false,
                    "markedUnreadAt": null,
                    "_id": "6a294b44314f7d3afb0cae80"
                }
            ],
            "lastMessage": "6a5e01f80a5ec1dd628b0f47",
            "createdAt": "2026-06-10T11:32:20.227Z",
            "updatedAt": "2026-07-20T11:09:44.975Z",
            "__v": 0
        }
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

caller cant call himself:

```json
{
    "success": false,
    "message": "Cannot call yourself"
}
```

Invalid receiverId:

```json
{
    "success": false,
    "message": "Receiver not found"
}
```

Receiver offline:

```json
{
    "success": false,
    "message": "User is offline"
}
```

Receiver already in call:

```json
{
  "message": "User is busy"
}
```

## 58. Pin messages

**Endpoint**
POST group/pin-message

**Description**
Pin messages for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| messageId | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe
messageId = 6a2fef3f4a023f4327e29027

**Success Response (200)**

```json
{
    "success": true,
    "message": "Message pinned successfully",
    "data": {
        "replyPreview": {
            "content": "",
            "sender": null,
            "messageType": "text",
            "mediaUrl": ""
        },
        "_id": "6a2fef3f4a023f4327e29027",
        "chatId": null,
        "groupId": "6a2fe8214a023f4327e28ffe",
        "sender": "69e72c7addf28cd247bd4ef1",
        "receiver": null,
        "content": "Hello Group",
        "messageType": "text",
        "replyTo": null,
        "isForwarded": false,
        "forwardedFrom": null,
        "mediaType": null,
        "mediaUrl": "",
        "thumbnailUrl": "",
        "caption": "",
        "audioDuration": 0,
        "waveform": [],
        "mediaSize": 0,
        "fileName": "",
        "filePath": "",
        "fileType": "",
        "fileSize": 0,
        "status": "sent",
        "deletedFor": [],
        "isDeleted": false,
        "deletedAt": null,
        "isEdited": false,
        "isPinned": true,
        "pinnedBy": "69e72c7addf28cd247bd4ef1",
        "pinnedAt": "2026-06-15T12:27:23.216Z",
        "readBy": [],
        "createdAt": "2026-06-15T12:25:35.619Z",
        "updatedAt": "2026-06-15T12:27:23.217Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Message or Group not found"
}
```

Not messageId:

```json
{
    "success": false,
    "message": "Message or Group not found"
}
```

## 59. Get pinned messages

**Endpoint**
GET group/pinned-messages/:messageId

**Description**
Get pinned messages for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe

**Success Response (200)**

```json
{
    "success": true,
    "count": 1,
    "data": [
        {
            "replyPreview": {
                "content": "",
                "sender": null,
                "messageType": "text",
                "mediaUrl": ""
            },
            "_id": "6a2fef3f4a023f4327e29027",
            "chatId": null,
            "groupId": "6a2fe8214a023f4327e28ffe",
            "sender": {
                "_id": "69e72c7addf28cd247bd4ef1",
                "name": "Vikra"
            },
            "receiver": null,
            "content": "Hello Group",
            "messageType": "text",
            "replyTo": null,
            "isForwarded": false,
            "forwardedFrom": null,
            "mediaType": null,
            "mediaUrl": "",
            "thumbnailUrl": "",
            "caption": "",
            "audioDuration": 0,
            "waveform": [],
            "mediaSize": 0,
            "fileName": "",
            "filePath": "",
            "fileType": "",
            "fileSize": 0,
            "status": "sent",
            "deletedFor": [],
            "isDeleted": false,
            "deletedAt": null,
            "isEdited": false,
            "isPinned": true,
            "pinnedBy": {
                "_id": "69e72c7addf28cd247bd4ef1",
                "name": "Vikra"
            },
            "pinnedAt": "2026-06-15T12:27:23.216Z",
            "readBy": [],
            "createdAt": "2026-06-15T12:25:35.619Z",
            "updatedAt": "2026-06-15T12:27:23.217Z",
            "__v": 0
        }
    ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 60. Unpin message

**Endpoint**
POST group/unpin-message

**Description**
Unpin message for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| messageId | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe
messageId = 6a2fef3f4a023f4327e29027

**Success Response (200)**

```json
{
    "success": true,
    "message": "Message unpinned successfully",
    "data": {
        "replyPreview": {
            "content": "",
            "sender": null,
            "messageType": "text",
            "mediaUrl": ""
        },
        "_id": "6a2fef3f4a023f4327e29027",
        "chatId": null,
        "groupId": "6a2fe8214a023f4327e28ffe",
        "sender": "69e72c7addf28cd247bd4ef1",
        "receiver": null,
        "content": "Hello Group",
        "messageType": "text",
        "replyTo": null,
        "isForwarded": false,
        "forwardedFrom": null,
        "mediaType": null,
        "mediaUrl": "",
        "thumbnailUrl": "",
        "caption": "",
        "audioDuration": 0,
        "waveform": [],
        "mediaSize": 0,
        "fileName": "",
        "filePath": "",
        "fileType": "",
        "fileSize": 0,
        "status": "sent",
        "deletedFor": [],
        "isDeleted": false,
        "deletedAt": null,
        "isEdited": false,
        "isPinned": false,
        "pinnedBy": null,
        "pinnedAt": null,
        "readBy": [],
        "createdAt": "2026-06-15T12:25:35.619Z",
        "updatedAt": "2026-06-15T12:37:18.751Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Message or Group not found"
}
```

Not messageId:

```json
{
    "success": false,
    "message": "Message or Group not found"
}
```

## 61. Update rules

**Endpoint**
PUT group/update-rules

**Description**
Update rules for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| rules | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe
rules = ["Rule 1", "Rule 2"]

**Success Response (200)**

```json
{
    "success": true,
    "message": "Rules updated successfully",
    "data": [
        "Rule 1",
        "Rule 2"
    ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Missing rules:

```json
{
    "success": false,
    "message": "Rules must be an array"
}
```

## 62. Get rules

**Endpoint**
GET group/rules/:groupId

**Description**
Get rules for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |

Example:

GET group/rules/:groupId

**Success Response (200)**

```json
{
    "success": true,
    "count": 2,
    "data": [
        "Rule 1",
        "Rule 2"
    ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

## 63. Assign admin

**Endpoint**
POST group/assign-admin

**Description**
Assign admin for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| userId | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe
userId = 69e72c7eddf28cd247bd4ef4

**Success Response (200)**

```json
{
    "success": true,
    "message": "Admin assigned successfully"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Not userId:

```json
{
    "success": false,
    "message": "Member not found"
}
```

## 64. Remove admin

**Endpoint**
POST group/remove-admin

**Description**
Remove admin access for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| userId | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe
userId = 69e72c7eddf28cd247bd4ef4

**Success Response (200)**

```json
{
    "success": true,
    "message": "Admin removed successfully"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Not userId:

```json
{
    "success": false,
    "message": "Member not found"
}
```

## 65. Mute member

**Endpoint**
POST group/mute-member

**Description**
Mute member for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| userId | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe
userId = 69e72c7eddf28cd247bd4ef4

**Success Response (200)**

```json
{
    "success": true,
    "message": "Member muted successfully"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Not userId:

```json
{
    "success": false,
    "message": "Member not found"
}
```

## 66. Unmute member

**Endpoint**
POST group/unmute-member

**Description**
Unmute member for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| groupId | String | Yes |  |
| userId | String | Yes |  |

Example:

groupId = 6a2fe8214a023f4327e28ffe
userId = 69e72c7eddf28cd247bd4ef4

**Success Response (200)**

```json
{
    "success": true,
    "message": "Member unmuted successfully"
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Not groupId:

```json
{
    "success": false,
    "message": "Group not found"
}
```

Not userId:

```json
{
    "success": false,
    "message": "Member not found"
}
```

## 67. Create broadcast

**Endpoint**
POST broadcast/create

**Description**
Create broadcast for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| name | String | Yes |  |
| participants | String | Yes |  |

Example:

name = Sprint Updates
participants = [69e72c7eddf28cd247bd4ef4, 69e71ce04655b3c65c3bbb5a]

**Success Response (200)**

```json
{
    "success": true,
    "message": "Broadcast created successfully",
    "data": {
        "name": "Sprint Updates",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            "69e72c7eddf28cd247bd4ef4",
            "69e71ce04655b3c65c3bbb5a"
        ],
        "_id": "6a30a8b474ee215d28c6bd18",
        "createdAt": "2026-06-16T01:36:52.752Z",
        "updatedAt": "2026-06-16T01:36:52.752Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing broadcast name:

```json
{
    "success": false,
    "message": "Broadcast name is required"
}
```

Misssing participants:

```json
{
    "success": false,
    "message": "At least one participant is required"
}
```

## 68. Braoadcast lists

**Endpoint**
GET broadcast/my-lists

**Description**
Get the broadcast lists for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|

Example:

GET broadcast/my-lists

**Success Response (200)**

```json
{
    "success": true,
    "count": 1,
    "data": [
        {
            "_id": "6a30a8b474ee215d28c6bd18",
            "name": "Sprint Updates",
            "createdBy": "69e72c7addf28cd247bd4ef1",
            "participants": [
                {
                    "_id": "69e72c7eddf28cd247bd4ef4",
                    "name": "jo",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                },
                {
                    "_id": "69e71ce04655b3c65c3bbb5a",
                    "name": "Pradeep",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                }
            ],
            "createdAt": "2026-06-16T01:36:52.752Z",
            "updatedAt": "2026-06-16T01:36:52.752Z",
            "__v": 0
        }
    ]
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

## 69. Send broadcast message

**Endpoint**
POST broadcast/send

**Description**
Send message in broadcast for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| broadcastId | String | Yes |  |
| content | String | Yes |  |

Example:

broadcastId = 6a30a8b474ee215d28c6bd18
content = Welcome to broadcast

**Success Response (200)**

```json
{
    "success": true,
    "message": "Broadcast sent successfully",
    "totalRecipients": 2,
    "messagesCreated": 2
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing broadcastId:

```json
{
    "success": false,
    "message": "broadcastId and content are required"
}
```

Misssing content:

```json
{
    "success": false,
    "message": "broadcastId and content are required"
}
```

## 70. Add broadcast member

**Endpoint**
POST broadcast/add-member

**Description**
Add member in broadcast for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| broadcastId | String | Yes |  |
| userId | String | Yes |  |

Example:

broadcastId = 6a30a8b474ee215d28c6bd18
userId = 69d75d236f48c9b045d574b6

**Success Response (200)**

```json
{
    "success": true,
    "message": "Member added successfully",
    "data": {
        "_id": "6a30a8b474ee215d28c6bd18",
        "name": "Sprint Updates",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            "69e72c7eddf28cd247bd4ef4",
            "69e71ce04655b3c65c3bbb5a",
            "69d75d236f48c9b045d574b6"
        ],
        "createdAt": "2026-06-16T01:36:52.752Z",
        "updatedAt": "2026-06-16T01:57:08.161Z",
        "__v": 1
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing broadcastId:

```json
{
    "success": false,
    "message": "Broadcast not found"
}
```

Misssing userId:

```json
{
    "success": false,
    "message": "User not found"
}
```

## 71. Remove broadcast member

**Endpoint**
POST broadcast/remove-member

**Description**
Remove member from broadcast for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| broadcastId | String | Yes |  |
| userId | String | Yes |  |

Example:

broadcastId = 6a30a8b474ee215d28c6bd18
userId = 69d75d236f48c9b045d574b6

**Success Response (200)**

```json
{
    "success": true,
    "message": "Member removed successfully",
    "data": {
        "_id": "6a30a8b474ee215d28c6bd18",
        "name": "Sprint Updates",
        "createdBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            "69e72c7eddf28cd247bd4ef4",
            "69e71ce04655b3c65c3bbb5a"
        ],
        "createdAt": "2026-06-16T01:36:52.752Z",
        "updatedAt": "2026-06-16T02:01:15.225Z",
        "__v": 2
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing broadcastId:

```json
{
    "success": false,
    "message": "Broadcast not found"
}
```

Misssing userId:

```json
{
    "success": false,
    "message": "User not found"
}
```

## 72. Broadcast details

**Endpoint**
GET broadcast/:broadcastId

**Description**
Get broadcast details for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| broadcastId | String | Yes |  |

Example:

GET broadcast/6a30a8b474ee215d28c6bd18

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6a30a8b474ee215d28c6bd18",
        "name": "Sprint Updates",
        "createdBy": {
            "_id": "69e72c7addf28cd247bd4ef1",
            "name": "Vikra",
            "profilePic": "",
            "email": "testd1@updat.com"
        },
        "participants": [
            {
                "_id": "69e72c7eddf28cd247bd4ef4",
                "name": "jo",
                "profilePic": "https://ui-avatars.com/api/?name=User"
            },
            {
                "_id": "69e71ce04655b3c65c3bbb5a",
                "name": "Pradeep",
                "profilePic": "https://ui-avatars.com/api/?name=User"
            }
        ],
        "createdAt": "2026-06-16T01:36:52.752Z",
        "updatedAt": "2026-06-16T02:01:15.225Z",
        "__v": 2
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Missing broadcastId:

```json
{
    "success": false,
    "message": "Broadcast not found"
}
```

## 73. Call history

**Endpoint**
GET call/history

**Description**
Get call history for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|

Example:

GET call/history

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "personalCalls": [
            {
                "_id": "6a3285d4db12353dec909bb1",
                "caller": {
                    "_id": "69e72c7addf28cd247bd4ef1",
                    "name": "Vikra",
                    "profilePic": ""
                },
                "receiver": {
                    "_id": "69e72c7eddf28cd247bd4ef4",
                    "name": "jo",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                },
                "chat": "6a0bd6bf5fbd42f87e0a23ff",
                "type": "video",
                "status": "completed",
                "startedAt": "2026-06-17T11:32:38.518Z",
                "endedAt": "2026-06-17T11:34:31.430Z",
                "duration": 112,
                "createdAt": "2026-06-17T11:32:36.650Z",
                "updatedAt": "2026-06-17T11:34:31.430Z",
                "__v": 0
            }
        ],
        "groupCalls": [
            {
                "_id": "6a38fb2fe1ddc638baf42934",
                "groupId": {
                    "_id": "6a2fe8214a023f4327e28ffe",
                    "groupName": "Test man"
                },
                "startedBy": {
                    "_id": "69e72c7addf28cd247bd4ef1",
                    "name": "Vikra",
                    "profilePic": ""
                },
                "participants": [
                    {
                        "user": "69e72c7addf28cd247bd4ef1",
                        "joinedAt": "2026-06-22T09:06:55.737Z",
                        "leftAt": "2026-06-22T09:12:40.525Z",
                        "isMuted": false,
                        "videoEnabled": true
                    },
                    {
                        "user": "69e72c7eddf28cd247bd4ef4",
                        "joinedAt": "2026-06-22T09:07:06.464Z",
                        "leftAt": "2026-06-22T09:12:38.500Z",
                        "isMuted": false,
                        "videoEnabled": true
                    },
                    {
                        "user": "69e71ce04655b3c65c3bbb5a",
                        "joinedAt": "2026-06-22T09:09:18.679Z",
                        "leftAt": "2026-06-22T09:12:35.092Z",
                        "isMuted": false,
                        "videoEnabled": true
                    }
                ],
                "type": "audio",
                "status": "ended",
                "screenSharingUser": null,
                "isScreenSharing": false,
                "endedAt": "2026-06-22T09:12:40.527Z",
                "duration": 344,
                "startedAt": "2026-06-22T09:06:55.739Z",
                "createdAt": "2026-06-22T09:06:55.739Z",
                "updatedAt": "2026-06-22T09:12:40.528Z",
                "__v": 2
            }
        ]
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

## 74. Call details

**Endpoint**
GET call/details/:id

**Description**
Get a single call details (Personal & Group) for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|
| type | personal | yes |  |
| type | group | yes |  |

Example:

1. Personal call
GET call/details/6a3285d4db12353dec909bb1?type=personal

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6a3285d4db12353dec909bb1",
        "caller": {
            "_id": "69e72c7addf28cd247bd4ef1",
            "name": "Vikra",
            "profilePic": ""
        },
        "receiver": {
            "_id": "69e72c7eddf28cd247bd4ef4",
            "name": "jo",
            "profilePic": "https://ui-avatars.com/api/?name=User"
        },
        "chat": "6a0bd6bf5fbd42f87e0a23ff",
        "type": "video",
        "status": "completed",
        "startedAt": "2026-06-17T11:32:38.518Z",
        "endedAt": "2026-06-17T11:34:31.430Z",
        "duration": 112,
        "createdAt": "2026-06-17T11:32:36.650Z",
        "updatedAt": "2026-06-17T11:34:31.430Z",
        "__v": 0
    }
}
```

2. Group call
GET call/details/6a38fb2fe1ddc638baf42934?type=group

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6a38fb2fe1ddc638baf42934",
        "groupId": {
            "_id": "6a2fe8214a023f4327e28ffe",
            "groupName": "Test man"
        },
        "startedBy": "69e72c7addf28cd247bd4ef1",
        "participants": [
            {
                "user": {
                    "_id": "69e72c7addf28cd247bd4ef1",
                    "name": "Vikra",
                    "profilePic": ""
                },
                "joinedAt": "2026-06-22T09:06:55.737Z",
                "leftAt": "2026-06-22T09:12:40.525Z",
                "isMuted": false,
                "videoEnabled": true
            },
            {
                "user": {
                    "_id": "69e72c7eddf28cd247bd4ef4",
                    "name": "jo",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                },
                "joinedAt": "2026-06-22T09:07:06.464Z",
                "leftAt": "2026-06-22T09:12:38.500Z",
                "isMuted": false,
                "videoEnabled": true
            },
            {
                "user": {
                    "_id": "69e71ce04655b3c65c3bbb5a",
                    "name": "Pradeep",
                    "profilePic": "https://ui-avatars.com/api/?name=User"
                },
                "joinedAt": "2026-06-22T09:09:18.679Z",
                "leftAt": "2026-06-22T09:12:35.092Z",
                "isMuted": false,
                "videoEnabled": true
            }
        ],
        "type": "audio",
        "status": "ended",
        "screenSharingUser": null,
        "isScreenSharing": false,
        "endedAt": "2026-06-22T09:12:40.527Z",
        "duration": 344,
        "startedAt": "2026-06-22T09:06:55.739Z",
        "createdAt": "2026-06-22T09:06:55.739Z",
        "updatedAt": "2026-06-22T09:12:40.528Z",
        "__v": 2
    }
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

Incorrect personal callid:

```json
{
    "success": false,
    "message": "Call not found"
}
```

Incorrect group callid:

```json
{
    "success": false,
    "message": "Group call not found"
}
```

## 75. Missed Call Count

**Endpoint**
GET call/missed-count

**Description**
Get missed call counts for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|

Example:

GET call/missed-count

**Success Response (200)**

```json
{
    "success": true,
    "count": 11
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```

## 76. Quick redail

**Endpoint**
GET call/missed-count

**Description**
Get missed call counts for authenticated user

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|

Example:

GET call/missed-count

**Success Response (200)**

```json
{
    "success": true,
    "count": 11
}
```

**Validation Errors**

Missing token:

```json
{
  "message": "Unauthorized"
}
```
## 77. Report User  

**Endpoint** 
POST/api/report/report-user

**Description** 
Allows a user to report another user for inappropriate behavior such as spam, harassment, abusive content, fake profile, or other violations. The report is stored in the database.

**Headers**
Content-Type: application/json

**Request Body**

|Field	         |  Type	 |Required |	Description|
|--------------|---------|---------|-------------|
|reporterId     |	String |Yes	     |ID of the user submitting the report |
|reportedUserId |	String |Yes	     |ID of the user being reported|
|reason	       |String	 |Yes	     |Reason for reporting (e.g., Spam, Harassment, Fake Profile)|
|description	   |  String |No       |	Additional information about the report|

Example:

```json
{
  "reporterId": "6a3cc101b8541f83de412639",
  "reportedUserId": "6a3cc53c4d960f8e1ca1a9e8",
  "reason": "Spam",
  "description": "Sending unwanted messages"
}
```

**Success Response (200)**
```json
{
    "success": true,
    "message": "Report submitted successfully",
    "report": {
        "reporterId": "6a3cc101b8541f83de412639",
        "reportedUserId": "6a3cc53c4d960f8e1ca1a9e8",
        "reason": "Spam",
        "description": "Sending unwanted messages",
        "status": "Pending",
        "_id": "6a42184e79afbd14086a7d18",
        "createdAt": "2026-06-29T07:01:34.234Z",
        "updatedAt": "2026-06-29T07:01:34.234Z",
        "__v": 0
    }
}
```

**Validation Errors**

Missing reason:
```json
{
    "success": false,
    "message": "Missing required fields"
}
```

## 78. View User Reports

**Endpoint** 
GET /api/admin/reports

**Description** 
Returns all reported user records for admin management

**Headers**
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|-----------|-------------|

Example:
 GET /api/admin/reports

 ```json
{
        "_id": "6a3cc5fc4d960f8e1ca1a9ea",
        "reporterId": {
            "_id": "6a3cc101b8541f83de412639",
            "email": "spideraji0321@gmail.com",
            "name": "Ajith"
        },
        "reportedUserId": {
            "_id": "6a3cc53c4d960f8e1ca1a9e8",
            "email": "jepisha2003@gmail.com"
        },
        "reason": "Spam",
        "description": "Sending unwanted messages",
        "status": "Pending",
        "createdAt": "2026-06-25T06:09:00.398Z",
        "updatedAt": "2026-06-25T06:09:00.398Z",
        "__v": 0
    }
```

## 79. Update Report Status

**Endpoint** 
PUT /api/admin/reports/:reportId

**Description** 
Updates the status of a user report (for example, Pending, Reviewed, or Resolved) so administrators can track moderation actions.

**Headers**
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description                       |
|-------|------|----------|-----------------------------------|
|status |String| Yes      | New report status (e.g., Reviewed)|
 
Example:

```json
{
  "status": "Reviewed"
}
```

**Success Response (200)**
```json
{
    "_id": "6a3cc5fc4d960f8e1ca1a9ea",
    "reporterId": "6a3cc101b8541f83de412639",
    "reportedUserId": "6a3cc53c4d960f8e1ca1a9e8",
    "reason": "Spam",
    "description": "Sending unwanted messages",
    "status": "Reviewed",
    "createdAt": "2026-06-25T06:09:00.398Z",
    "updatedAt": "2026-06-29T07:20:20.834Z",
    "__v": 0
}
```

## 80. Set Disappearing Message Timer

**Endpoint** 
POST /api/chats/set-disappearing-timer

**Description** 
Sets a disappearing message timer for a chat between two users. All new messages sent after the timer is enabled will automatically expire and be deleted when the selected duration ends.

**Headers**
Content-Type: application/json

**Request Body**
| Field     | Type     | Required     | Description                                                      |
| --------- | -------- | ------------ | ---------------------------------------------------------------- |
| sender    | String   | Yes          | ID of the user enabling the disappearing message timer.          |
| receiver  | String   | Yes          | ID of the other chat participant.                                |
| timer     | String   | Yes          | Disappearing message duration (e.g., `24h`, `7d`, `30d`, `off`). |

Example:

```json
{
  "sender": "6a3cc53c4d960f8e1ca1a9e8",
  "receiver": "6a3ca9f89d8ee14842eaf6d0",
  "timer": "24h"
}
```
**Success Response (200)**
```json
{
    "success": true,
    "setting": {
        "_id": "6a4221a61938855b9d3c5806",
        "receiver": "6a3ca9f89d8ee14842eaf6d0",
        "sender": "6a3cc53c4d960f8e1ca1a9e8",
        "__v": 0,
        "createdAt": "2026-06-29T07:41:27.021Z",
        "disappearingTimer": "24h",
        "expiresAt": "2026-06-30T07:41:27.020Z",
        "updatedAt": "2026-06-29T07:41:27.021Z"
    }
}
```

## 81. Get Preferences

**Endpoint**
GET /api/preferences

**Description**
Retrieves all preference settings for the authenticated user.

**Headers**

Authorization: Bearer <token>

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6863d1d8d3b7a91fd53a9201",
        "theme": "system",
        "chatWallpaper": "",
        "notifications": true,
        "messageNotifications": true,
        "groupNotifications": true,
        "callNotifications": true,
        "soundEnabled": true,
        "vibrationEnabled": true,
        "popupPreview": true,
        "mediaUploadQuality": "High",
        "storageUsed": "2.4 GB",
        "mobileData": true,
        "wifi": true,
        "roaming": false
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

##  82. Update Preferences

**Endpoint**
PUT /api/preferences

**Description**
Updates preference settings for the authenticated user.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| theme | String | No | Application theme |
| chatWallpaper | String | No | Chat wallpaper URL |
| notifications | Boolean | No | Enable notifications |
| messageNotifications | Boolean | No | Message notifications |
| groupNotifications | Boolean | No | Group notifications |
| callNotifications | Boolean | No | Call notifications |
| soundEnabled | Boolean | No | Notification sound |
| vibrationEnabled | Boolean | No | Vibration |
| popupPreview | Boolean | No | Popup preview |

Example:

```json
{
    "theme": "dark",
    "notifications": true,
    "messageNotifications": true,
    "groupNotifications": false,
    "callNotifications": true
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Preferences updated successfully",
    "data": {}
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 83. Get Theme

**Endpoint**
GET /api/preferences/theme

**Description**
Retrieves the current application theme.

**Headers**

Authorization: Bearer <token>

**Success Response (200)**

```json
{
    "success": true,
    "theme": "dark"
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 84. Update Theme

**Endpoint**
PUT /api/preferences/theme

**Description**
Updates the application theme.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| theme | String | Yes | light, dark or system |

Example:

```json
{
    "theme": "dark"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Theme updated successfully",
    "theme": "dark"
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 85. Get Chat Wallpaper

**Endpoint**
GET /api/preferences/chat-wallpaper

**Description**
Retrieves the user's current chat wallpaper.

**Headers**

Authorization: Bearer <token>

**Success Response (200)**

```json
{
    "success": true,
    "chatWallpaper": "https://example.com/wallpaper.jpg"
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 86. Update Chat Wallpaper

**Endpoint**
PUT /api/preferences/chat-wallpaper

**Description**
Updates the user's chat wallpaper.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| chatWallpaper | String | Yes | Wallpaper image URL |

Example:

```json
{
    "chatWallpaper": "https://example.com/wallpaper.jpg"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Chat wallpaper updated successfully",
    "chatWallpaper": "https://example.com/wallpaper.jpg"
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 87. Get Notification Settings

**Endpoint**
GET /api/preferences/notifications

**Description**
Retrieves notification settings for the authenticated user.

**Headers**

Authorization: Bearer <token>

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6a5f6a90da408d07e82b574b",
        "notifications": true,
        "messageNotifications": true,
        "groupNotifications": true,
        "callNotifications": true,
        "soundEnabled": true,
        "notificationTone": "Default",
        "vibrationEnabled": true,
        "popupPreview": true
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 88. Update Notification Settings

**Endpoint**
PUT /api/preferences/notifications

**Description**
Updates notification settings for the authenticated user.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field                | Type    | Required | Description                                 |
|----------------------|---------|----------|---------------------------------------------|
| notifications        | Boolean | No       | Enable notifications                        |
| messageNotifications | Boolean | No       | Message notifications                       |
| groupNotifications   | Boolean | No       | Group notifications                         |
| callNotifications    | Boolean | No       | Call notifications                          |
| soundEnabled         | Boolean | No       | Notification sound                          |
| notificationTone     | String  | No       | Tones are "Default", "Chime", "Bell", "Pop" |
| vibrationEnabled     | Boolean | No       | Vibration                                   |
| popupPreview         | Boolean | No       | Popup preview                               |

Example:

```json
{
    "notifications": true,
    "messageNotifications": true,
    "groupNotifications": true,
    "callNotifications": true,
    "soundEnabled": true,
    "notificationTone": "Default",
    "vibrationEnabled": true,
    "popupPreview": true
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Notification settings updated successfully",
    "data": {
        "_id": "6a5f6a90da408d07e82b574b",
        "notifications": true,
        "messageNotifications": true,
        "groupNotifications": true,
        "callNotifications": true,
        "soundEnabled": true,
        "notificationTone": "Default",
        "vibrationEnabled": true,
        "popupPreview": true
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 89. Get Data Usage & Storage Settings

**Endpoint**
GET /api/preferences/data-usage

**Description**
Retrieves data usage and storage settings for the authenticated user.

**Headers**

Authorization: Bearer <token>

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "mediaUploadQuality": "High",
        "storageUsed": "2.4 GB",
        "cacheClearedAt": "2026-06-28T10:30:45.000Z"
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 90. Update Data Usage & Storage Settings

**Endpoint**
PUT /api/preferences/data-usage

**Description**
Updates data usage and storage settings.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| mediaUploadQuality | String | No | Media upload quality (Low, Medium, High) |
| storageUsed | String | No | Current storage usage |
| cacheClearedAt | Date | No | Last cache clear timestamp |

Example:

```json
{
    "mediaUploadQuality": "Medium",
    "storageUsed": "3.1 GB",
    "cacheClearedAt": "2026-06-30T08:45:12.000Z"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Data usage settings updated successfully",
    "data": {
        "mediaUploadQuality": "Medium",
        "storageUsed": "3.1 GB",
        "cacheClearedAt": "2026-06-30T08:45:12.000Z"
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 91. Get Auto Download Settings

**Endpoint**
GET /api/preferences/auto-download

**Description**
Retrieves media auto-download settings.

**Headers**

Authorization: Bearer <token>

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "mobileData": true,
        "wifi": true,
        "roaming": false
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 92. Update Auto Download Settings

**Endpoint**
PUT /api/preferences/auto-download

**Description**
Updates media auto-download settings.

**Headers**

Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| mobileData | Boolean | No | Allow downloads on mobile data |
| wifi | Boolean | No | Allow downloads on Wi-Fi |
| roaming | Boolean | No | Allow downloads while roaming |

Example:

```json
{
    "mobileData": true,
    "wifi": true,
    "roaming": false
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Auto download settings updated successfully",
    "data": {
        "mobileData": true,
        "wifi": true,
        "roaming": false
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 93. Generate analytics

**Endpoint**
POST /api/system-admin/analytics/generate

**Description**
Authorized user can generate analytics.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

POST /api/system-admin/analytics/generate

**Success Response (200)**

```json
{
    "success": true,
    "message": "Analytics snapshot generated successfully.",
    "data": {
        "_id": "6a4c6b2bbe729e422bcb6f44",
        "__v": 0,
        "androidUsers": 0,
        "callSuccessRate": 47.37,
        "crashReports": 0,
        "createdAt": "2026-07-07T02:57:47.554Z",
        "dailyActiveUsers": 0,
        "iosUsers": 0,
        "messageDeliveryRate": 0,
        "notificationSuccessRate": 0,
        "snapshotDate": "2026-07-07T03:00:17.535Z",
        "updatedAt": "2026-07-07T03:00:17.535Z",
        "appVersion": "1.0.0"
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 94. Get analytics dashboard

**Endpoint**
GET /api/system-admin/analytics/dashboard

**Description**
Authorized user can get the generated analytics to the dashboard.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/system-admin/analytics/dashboard

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6a4c6b2bbe729e422bcb6f44",
        "__v": 0,
        "androidUsers": 0,
        "callSuccessRate": 47.37,
        "crashReports": 0,
        "createdAt": "2026-07-07T02:57:47.554Z",
        "dailyActiveUsers": 0,
        "iosUsers": 0,
        "messageDeliveryRate": 0,
        "notificationSuccessRate": 0,
        "snapshotDate": "2026-07-07T03:00:17.535Z",
        "updatedAt": "2026-07-07T03:00:17.535Z",
        "appVersion": "1.0.0"
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 95. Export analytics dashboard

**Endpoint**
GET /api/system-admin/analytics/export

**Description**
Authorized user can export the generated analytics.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/system-admin/analytics/export

**Success Response (200)**

```json
{
    "success": true,
    "message": "Analytics exported successfully.",
    "data": [
        {
            "_id": "6a4c6b2bbe729e422bcb6f44",
            "__v": 0,
            "androidUsers": 0,
            "callSuccessRate": 47.37,
            "crashReports": 0,
            "createdAt": "2026-07-07T02:57:47.554Z",
            "dailyActiveUsers": 0,
            "iosUsers": 0,
            "messageDeliveryRate": 0,
            "notificationSuccessRate": 0,
            "snapshotDate": "2026-07-07T03:16:13.745Z",
            "updatedAt": "2026-07-07T03:16:13.745Z"
        }
    ]
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 96. Get Release Checklist

**Endpoint**
GET /api/system-admin/release

**Description**
Retrieves the current release readiness checklist.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/system-admin/release

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6a4c7ac3ddd2a459ea8fb498",
        "criticalBugsFixed": true,
        "loadTestingPassed": true,
        "securityAuditApproved": false,
        "backupRecoveryTested": false,
        "monitoringAlertsConfigured": false,
        "approvalStatus": "Pending",
        "releaseStatus": "Pending",
        "rollbackPlan": "",
        "releasedAt": null,
        "createdAt": "2026-07-07T04:04:19.428Z",
        "updatedAt": "2026-07-07T04:04:19.449Z",
        "buildVersion": "1.0.0"
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 97. Update Release Checklist

**Endpoint**
PUT /api/system-admin/release

**Description**
Updates the release readiness checklist items.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field                      | Type    | Required | Description                     |
|----------------------------|---------|----------|---------------------------------|
| securityAuditApproved      | Boolean | No       | Security audit approval         |
| backupRecoveryTested       | Boolean | No       | Backup recovery verification    |
| monitoringAlertsConfigured | Boolean | No       | Monitoring alerts configuration |
| approvalStatus             | String  | No       | Approved for release or not     |
| rollbackPlan               | String  | No       | Rollback strategy               |

Example:

```json
{
  "securityAuditApproved": true,
  "backupRecoveryTested": true,
  "monitoringAlertsConfigured": true,
  "approvalStatus": "Approved",
  "rollbackPlan": "Rollback to previous stable release."
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Release checklist updated successfully.",
    "data": {
        "_id": "6a4c7ac3ddd2a459ea8fb498",
        "criticalBugsFixed": true,
        "loadTestingPassed": true,
        "securityAuditApproved": true,
        "backupRecoveryTested": true,
        "monitoringAlertsConfigured": true,
        "approvalStatus": "Approved",
        "releaseStatus": "Pending",
        "rollbackPlan": "Rollback to previous stable release.",
        "releasedAt": null,
        "createdAt": "2026-07-07T04:04:19.428Z",
        "updatedAt": "2026-07-07T04:10:34.129Z",
        "buildVersion": "1.0.0"
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 98. Release validate

**Endpoint**
POST /api/system-admin/release/validate

**Description**
Checks wheather ready to release or not.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

POST /api/system-admin/release/validate

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6a4c7ac3ddd2a459ea8fb498",
        "criticalBugsFixed": true,
        "loadTestingPassed": true,
        "securityAuditApproved": true,
        "backupRecoveryTested": true,
        "monitoringAlertsConfigured": true,
        "approvalStatus": "Approved",
        "releaseStatus": "Pending",
        "rollbackPlan": "Rollback to previous stable release.",
        "releasedAt": null,
        "createdAt": "2026-07-07T04:04:19.428Z",
        "updatedAt": "2026-07-07T04:18:23.948Z",
        "buildVersion": "1.0.0",
        "readyForRelease": true
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

## 99. Go Live

**Endpoint**
POST /api/system-admin/release/go-live

**Description**
Deploys the approved release and updates the release status to **Live**.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

POST /api/system-admin/release/go-live

**Success Response (200)**

```json
{
    "success": true,
    "message": "Application deployed successfully.",
    "data": {
        "_id": "6a4c7ac3ddd2a459ea8fb498",
        "criticalBugsFixed": true,
        "loadTestingPassed": true,
        "securityAuditApproved": true,
        "backupRecoveryTested": true,
        "monitoringAlertsConfigured": true,
        "approvalStatus": "Approved",
        "releaseStatus": "Live",
        "rollbackPlan": "Rollback to previous stable release.",
        "releasedAt": "2026-07-07T04:24:45.555Z",
        "createdAt": "2026-07-07T04:04:19.428Z",
        "updatedAt": "2026-07-07T04:24:45.555Z",
        "buildVersion": "1.0.0"
    }
}
```

**Validation Errors**

Missing token:

```json
{
    "message": "Unauthorized"
}
```

Release not approved:

```json
{
    "success": false,
    "message": "Release is not ready for deployment."
}
```

## 100. Get Privacy Settings

**Endpoint**

GET /api/privacy/settings

**Description**
Retrieves all privacy settings for the authenticated user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/privacy/settings

**Success Response**

```json
{
    "success": true,
    "data": {
        "encryptionEnabled": false,
        "twoFactorEnabled": false,
        "blockedUsersCount": 1,
        "disappearingMessages": "7d"
    }
}
```

## 101. Update Privacy Settings

**Endpoint**

PUT /api/privacy/settings

**Description**
Updates all privacy settings for the authenticated user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| encryptionEnabled | Boolean | Yes |  |
| disappearingMessages | String | Yes |  |

Example:

```json
{
  "disappearingMessages": "24h"
}
```

**Request Body**

```json
{
    "success": true,
    "message": "Settings updated successfully",
    "data": {
        "_id": "6a3cec114e7ef5def40bbbea",
        "userId": "69e72c7addf28cd247bd4ef1",
        "encryptionEnabled": false,
        "disappearingMessages": "24h",
        "createdAt": "2026-06-25T08:51:29.418Z",
        "updatedAt": "2026-07-08T02:49:39.200Z",
        "__v": 0
    }
}
```

**Success Response**

```json
{
  "success": true,
  "message": "Privacy settings updated successfully"
}
```

## 102. Get Encryption Information

**Endpoint**

GET /api/privacy/encryption-info

**Description**
Sends encrypted message for the authenticated user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/privacy/encryption-info

**Success Response**

```json
{
    "success": true,
    "data": {
        "enabled": true,
        "title": "End-to-End Encryption",
        "description": "Your messages, calls, media, and shared files are secured with end-to-end encryption. Only you and the recipient can read them. Not even Chatterly can access the content."
    }
}
```

## 103. Get Encryption Details

**Endpoint**

GET /api/privacy/encryption-details

**Description**
Get encryption details of the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/privacy/encryption-details

**Success Response**

```json
{
    "success": true,
    "data": {
        "messagesEncrypted": true,
        "callsEncrypted": true,
        "mediaEncrypted": true,
        "filesEncrypted": true,
        "serverCanReadMessages": false,
        "keyExchange": "ECDH",
        "encryptionAlgorithm": "AES-256"
    }
}
```

## 104. Get Security Code

**Endpoint**

GET /api/privacy/security-code/69e72c7addf28cd247bd4ef1

**Description**
Checks both users has encryption public keys to exchange.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/privacy/security-code/69e72c7addf28cd247bd4ef1

**Success Response**

```json
{
    "success": true,
    "data": {
        "securityCode": "E16F-E69F-5C06-B715-42E2-AFC8"
    }
}
```

## 105. Rotate Encryption Keys

**Endpoint**

POST /api/key-rotation/rotate

**Description**
Stores the pubic key from client for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| publicKey | String | Yes | Get from client side and stores |

Example:

```json
{
  "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE...\n-----END PUBLIC KEY-----"
}
```

**Success Response**

```json
{
    "success": true,
    "message": "Public key rotated successfully"
}
```

## 106. Enable Two Factor Authentication

**Endpoint**

POST /api/2fa/enable

**Description**
Enable 2FA by SMS or authenticator (Google or microsoft) for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| method | String | Yes | Enable 2FA by SMS or authenticator |

Example:

```json
{
  "method": "sms"
}
or
{
    "method":"authenticator"
}
```

**Success Response**

```json
{
    "success": true,
    "message": "2FA enabled successfully",
    "backupCodes": [
        "B2BC7EF2",
        "FA193CD2",
        "CA6EF6FA",
        "0439C267",
        "B9BF8A4C",
        "D90C57CA",
        "755854FE",
        "801B1CFC"
    ]
}
```

## 107. Disable Two Factor Authentication

**Endpoint**

POST /api/2fa/disable

**Description**
Disable 2FA for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

POST /api/2fa/disable

**Success Response**

```json
{
  "success": true,
  "message": "Two-factor authentication disabled"
}
```

## 108. Setup authenticator

**Endpoint**

POST /api/2fa/authenticator/setup

**Description**
Setup for QR code and Key for 2FA by authenticators for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

POST /api/2fa/authenticator/setup

**Success Response**

```json
{
    "success": true,
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMQAAADECAYAAADApo5rAAAAAklEQVR4AewaftIAAAjXSURBVO3BQY4kyRHAQDLR//8yNdAh4KcAElU92hXczP5grfVfD2ut42GtdTystY6HtdbxsNY6HtZax8Na63hYax0Pa63jYa11PKy1joe11vGw1joe1lrHw1rr+OFDKn9TxaTyiYpJZar4JpWpYlKZKiaVqeINld9UMan8TRWfeFhrHQ9rreNhrXX88GUV36TyRsUnKj6hMlXcqEwVNxXfVHGjMlVMKm9UfJPKNz2stY6HtdbxsNY6fvhlKm9U/E0qU8WkMlW8ofKGylQxqdxU3FTcqLxR8QmVNyp+08Na63hYax0Pa63jh3+5ikllqphUpopvqrhRuamYVKaKb1KZKt5QmSr+zR7WWsfDWut4WGsdP/zLqdyoTBWTyhsqNxWTyk3FpPKGylQxqUwVU8WNyk3F/5OHtdbxsNY6HtZaxw+/rOI3VUwqU8WkclNxozJVTCo3FTcVNypTxU3FjcpUMVX8pop/koe11vGw1joe1lrHD1+m8jepTBWTylQxqdyoTBWTylQxqdyoTBWTylQxqUwVk8pU8YbKVDGpTBU3Kv9kD2ut42GtdTystY4fPlTxv1QxqbxRMal8U8UnKt5Q+aaKSeWNin+Th7XW8bDWOh7WWscPH1KZKm5U/klUpooblRuV36QyVXyiYlJ5o2JSmSpuVKaKSeWNik88rLWOh7XW8bDWOn74MpWp4qbiDZWbijcqJpWp4o2KSeWmYlKZKt5QeaNiqphUblSmihuVqWJSmSomlanimx7WWsfDWut4WGsdP3yoYlK5qZhUpopJ5abiDZWpYqqYVKaKSWVSmSpuVKaKSeUTFZPKGxU3KpPKVHGj8gmVqeITD2ut42GtdTystY4fvqziRuWNijdU3lCZKqaKSWWqmFS+qWJSmVSmipuKG5WpYlKZKv6fPKy1joe11vGw1jp++JDKVPFGxaTyRsVNxY3KJ1Smijcq/iaVqWKquKm4Ubmp+KaKb3pYax0Pa63jYa11/PChihuVqeKNikllUpkqblTeULmpeEPlpmJSmSpuVG4qblT+JpWbiqliUpkqPvGw1joe1lrHw1rrsD/4IpU3KiaVb6q4UZkqblSmiknl36RiUpkqJpWbiknlpmJSmSomlanimx7WWsfDWut4WGsd9gcfULmpmFSmik+oTBWTyk3FjcpUMancVNyofKJiUpkqblT+lyomlU9UfOJhrXU8rLWOh7XW8cNfVjGpTBWTyk3FpHJTMal8omJSmVSmik9U3FTcqEwVb6hMFb+pYlKZKr7pYa11PKy1joe11vHDl1XcqLxRMancVEwqb1RMKpPKVPGJiknlDZWp4ptUblRuKm5Upoqbit/0sNY6HtZax8Na6/jhl6lMFTcqNxWTyk3FpDJV3FTcqHxTxSdUPqHyTSpTxSdUbio+8bDWOh7WWsfDWuuwP/gilZuK36QyVfyTqdxU3KjcVEwqU8WNyicqblTeqPhND2ut42GtdTystY4fflnFpDJV3KhMFZPKVDGpTBWTylRxozJV3Kh8k8o3qfwmlZuKG5VJ5abiEw9rreNhrXU8rLWOH36ZylRxozJVTCpTxaRyozJVTCpvqEwVU8WkMlXcqPymiknlExU3Kp+o+E0Pa63jYa11PKy1jh++rOJG5Q2VT1TcqLxRcaMyVUwVNypvVEwqb6hMFW+o3KhMFZPKTcXf9LDWOh7WWsfDWuuwP/hFKjcVb6hMFTcqU8WNyjdVTCpTxY3KTcWNylQxqdxU3Kh8ouINlZuKTzystY6HtdbxsNY6fvgylaniEyrfpDJV3FTcqEwVk8qNylQxVdyo3FTcVLyhMlV8QmWquKmYVL7pYa11PKy1joe11mF/8EUqU8WkMlV8QmWqmFRuKm5U3qj4TSpTxaTyTRU3KjcVn1CZKn7Tw1rreFhrHQ9rrcP+4BepTBWTyicqblSmikllqrhRmSreUJkqblSmikllqrhRmSreUJkqJpWbihuVqeJGZar4xMNa63hYax0Pa63jh19WMam8UfGbKiaVqeITKjcqU8VU8U9SMalMFW+o3KjcVHzTw1rreFhrHQ9rreOHD6ncVLxRMalMFZPKTcU3VUwqU8VNxaRyozJVTBWTylQxVXxCZap4Q2WqmFSmikllUpkqPvGw1joe1lrHw1rrsD/4gMobFZPKTcWNyhsVNyo3Fd+k8psq3lB5o+JGZaqYVG4q/qaHtdbxsNY6HtZaxw//cCpTxTepTBWTyt9UcaMyVdyoTBWTylTxhspU8ZtUbio+8bDWOh7WWsfDWuuwP/iAyk3FpDJVvKFyUzGpTBWTyjdVTCpTxRsqU8WkMlXcqLxRMalMFb9J5abimx7WWsfDWut4WGsdP/xlFZPKb6r4RMUnKj5R8U0Vb6jcqPxNFb/pYa11PKy1joe11mF/8C+mMlVMKjcVk8pNxY3KTcUbKlPFjcpNxaQyVdyo3FS8oXJTMalMFd/0sNY6HtZax8Na6/jhQyp/U8UbFZPKpDJV3KhMFVPFjcpUMalMFZ+ouKmYVL5JZap4Q+VvelhrHQ9rreNhrXX88GUV36TyCZWbiknlm1SmikllqrhR+YTKVPFGxaRyU/GJir/pYa11PKy1joe11vHDL1N5o+JvUrmpmFRuVKaKN1RuKiaVNyomlW9S+UTFjcpNxSce1lrHw1rreFhrHT/8n1GZKiaVqWJSual4Q2WqmCpuVCaVqWJSmVTeqJhUJpWpYlKZKt5Q+V96WGsdD2ut42GtdfzwL1fxTRWTylQxqdxUTCpvVLxRcaMyVdxUTCqfULmpmFT+poe11vGw1joe1lrHD7+s4m9SmSpuVKaKT1TcVHxCZap4o2JSmSomlU+oTBWTyk3Fjco3Pay1joe11vGw1jp++DKVv0nlN1VMKn+TylQxqdxUTCpTxU3FjcpUcaNyo3JTMVV808Na63hYax0Pa63D/mCt9V8Pa63jYa11PKy1joe11vGw1joe1lrHw1rreFhrHQ9rreNhrXU8rLWOh7XW8bDWOh7WWsfDWuv4D+IpyJJqO/qGAAAAAElFTkSuQmCC",
    "manualKey": "IJKGO3KXHA7CKQLXJFQSGQKDIB2DWN2NORPDG2JFIFSD4L3GHJZQ"
}
```

## 109. Verify authenticator

**Endpoint**

POST /api/2fa/authenticator/verify

**Description**
Verify the QR code or Key for 2FA by authenticators for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | To verify token with 2FA |

Example:

```json
{
  "token": "902572"
}
```

**Success Response**

```json
{
    "success": true,
    "message": "Authenticator verified",
    "backupCodes": [
        "1409B063",
        "2FF81A14",
        "D1E30FFD",
        "704CE265",
        "D91EB4FC",
        "35ECAA51",
        "78039179",
        "75D3FB60"
    ]
}
```

## 110. Verify backup code

**Endpoint**

POST /api/2fa/verify-backup-code

**Description**
Verify the backup code for 2FA by authenticators for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | To verify backup code with 2FA |

Example:

```json
{
    "code":"1409B063"
}
```

**Success Response**

```json
{
    "success": true,
    "message": "Backup code verified successfully"
}
```

## 111. Block User

**Endpoint**

POST /api/block/blocked

**Description**
Block users for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| blockedUserId | string | Yes | Block users |

Example:

```json
{
  "blockedUserId": "69e71ce04655b3c65c3bbb5a"
}
```

**Success Response**

```json
{
  "success": true,
  "message": "User blocked successfully"
}
```

## 112. Unblock User

**Endpoint**

POST /api/block/unblock

**Description**
Unblock users for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| blockedUserId | string | Yes | Unblock users |

Example:

```json
{
  "blockedUserId": "69e71ce04655b3c65c3bbb5a"
}
```

**Success Response**

```json
{
  "success": true,
  "message": "User unblocked successfully"
}
```

## 113. Get Blocked Users

**Endpoint**

GET /api/block/blocked-users

**Description**
Get blocked users for the authorized user.

**Headers**

Authorization: Bearer <token>

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/block/blocked-users

**Success Response**

```json
{
    "success": true,
    "blockedUsers": [
        {
            "_id": "69e72c7eddf28cd247bd4ef4",
            "name": "jo",
            "phone": "+916666666666",
            "profilePic": "https://ui-avatars.com/api/?name=User"
        }
    ]
}
```

## 114. Dashboard overview

**Endpoint** 
GET /api/system-admin/dashboard

**Description** 
Authorized user can view the dashboard for production on server status.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field | Type | Required  | Description |
|-------|------|-----------|-------------|

Example:

GET /api/system-admin/dashboard

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "serverStatus": "Healthy",
        "avgResponseTime": 6.67,
        "activeUsers": 2,
        "errorRate": 0,
        "buildVersion": "1.0.0"
    }
}
```

## 115. Performance overview

**Endpoint** 
GET /api/system-admin/performance

**Description** 
Authorized user can view the dashboard performance for production on server status.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field | Type | Required  | Description |
|-------|------|-----------|-------------|

Example:

GET /api/system-admin/performance

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "apiResponseTime": 1.56,
        "dbLatency": 0.65,
        "slowQueries": 0,
        "mediaCompression": "Enabled",
        "cdnStatus": "Active"
    }
}
```

## 116. Performance optimize

**Endpoint** 
POST /api/system-admin/performance/optimize

**Description** 
Authorized user can reset metrics for a fresh start.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field | Type | Required  | Description |
|-------|------|-----------|-------------|

Example:

POST /api/system-admin/performance/optimize

**Success Response (200)**

```json
{
    "success": true,
    "message": "System optimization completed successfully."
}
```

## 117. Create loadtest

**Endpoint** 
POST /api/system-admin/loadtest

**Description** 
Authorized user will perform a and create load and stress test.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field          | Type     | Required | Description                    |
|----------------|----------|----------|--------------------------------|
| requestedUsers | Number   | Yes      | Number of users to be tested.  |
| duration       | Number   | Yes      | Duration of time in minutes.   |

Example:

```json
{
  "requestedUsers": 50000,
  "duration": 30
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Load test created successfully.",
    "data": {
        "requestedUsers": 50000,
        "duration": 30,
        "maxUsersHandled": 50000,
        "crashEvents": 0,
        "avgCpuUsage": 0,
        "memoryUsage": "42.19 MB",
        "status": "completed",
        "completedAt": "2026-07-01T07:10:37.670Z",
        "_id": "6a44bd6d4f4fb4c78a571646",
        "startedAt": "2026-07-01T07:10:37.673Z",
        "createdAt": "2026-07-01T07:10:37.677Z",
        "updatedAt": "2026-07-01T07:10:37.677Z",
        "__v": 0
    }
}
```

## 118. Get loadtest result

**Endpoint** 
GET /api/system-admin/loadtest/:id

**Description** 
Authorized user can get the created load and stress test results.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field | Type | Required  | Description |
|-------|------|-----------|-------------|

Example:

GET /api/system-admin/loadtest/6a44b124586c6a49de649cea

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "_id": "6a44bd6d4f4fb4c78a571646",
        "requestedUsers": 50000,
        "duration": 30,
        "maxUsersHandled": 50000,
        "crashEvents": 0,
        "avgCpuUsage": 0,
        "memoryUsage": "42.19 MB",
        "status": "completed",
        "completedAt": "2026-07-01T07:10:37.670Z",
        "startedAt": "2026-07-01T07:10:37.673Z",
        "createdAt": "2026-07-01T07:10:37.677Z",
        "updatedAt": "2026-07-01T07:10:37.677Z",
        "__v": 0
    }
}
```

## 119. Create Bug report

**Endpoint** 
POST /api/system-admin/bugs

**Description** 
Authorized user can create bug report.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field       | Type   | Required | Description             |
|-------------|--------|----------|-------------------------|
| issue       | String | Yes      | Name of the issue       |
| description | String | Yes      | Details of the issue    |
| Severity    | String | Yes      | Impotrtant to the issue |

Example:

```json
{
    "issue": "Message delay",
    "description": "Messages are delayed by 10-15 seconds during peak traffic.",
    "severity": "High"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Bug created successfully.",
    "data": {
        "id": 1,
        "issue": "Message delay",
        "description": "Messages are delayed by 10-15 seconds during peak traffic.",
        "status": "Open",
        "severity": "High",
        "assignedDeveloper": null,
        "resolvedAt": null,
        "_id": "6a45c8293b6b979109e181da",
        "createdAt": "2026-07-02T02:08:41.599Z",
        "updatedAt": "2026-07-02T02:08:41.599Z",
        "__v": 0
    }
}
```

## 120. Get Bug report

**Endpoint** 
GET /api/system-admin/bugs

**Description** 
Authorized user can get the created bug report.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

GET /api/system-admin/bugs

**Success Response (200)**

```json
{
    "success": true,
    "count": 1,
    "data": [
        {
            "_id": "6a45c8293b6b979109e181da",
            "id": 1,
            "issue": "Message delay",
            "description": "Messages are delayed by 10-15 seconds during peak traffic.",
            "status": "Open",
            "severity": "High",
            "assignedDeveloper": null,
            "resolvedAt": null,
            "createdAt": "2026-07-02T02:08:41.599Z",
            "updatedAt": "2026-07-02T02:08:41.599Z",
            "__v": 0
        }
    ]
}
```

## 121. Get Bug report by severity

**Endpoint** 
GET /api/system-admin/bugs?severity=High

**Description** 
Authorized user can get the created bug report by the severity.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
PARAMS
| Field    | Type   | Required | Description             |
|----------|--------|----------|-------------------------|
| severity | String | Yes      | Impotrtant to the issue |

Example:

GET /api/system-admin/bugs?severity=High

**Success Response (200)**

```json
{
    "success": true,
    "count": 1,
    "data": [
        {
            "_id": "6a45c8293b6b979109e181da",
            "id": 1,
            "issue": "Message delay",
            "description": "Messages are delayed by 10-15 seconds during peak traffic.",
            "status": "Open",
            "severity": "High",
            "assignedDeveloper": null,
            "resolvedAt": null,
            "createdAt": "2026-07-02T02:08:41.599Z",
            "updatedAt": "2026-07-02T02:08:41.599Z",
            "__v": 0
        }
    ]
}
```

## 122. Assign developer

**Endpoint** 
PATCH /api/system-admin/bugs/:id/assign

**Description** 
Authorized user can assing a developer for the required bugs using bug id.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field           | Type   | Required | Description           |
|-----------------|--------|----------|-----------------------|
| assignDeveloper | String | Yes      | Name of the developer |

Example:

PATCH /api/system-admin/bugs/1/assign

```json
{
    "assignedDeveloper": "Vimal"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Developer assigned successfully.",
    "data": {
        "_id": "6a45c8293b6b979109e181da",
        "id": 1,
        "issue": "Message delay",
        "description": "Messages are delayed by 10-15 seconds during peak traffic.",
        "status": "In Progress",
        "severity": "High",
        "assignedDeveloper": "Vimal",
        "resolvedAt": null,
        "createdAt": "2026-07-02T02:08:41.599Z",
        "updatedAt": "2026-07-02T02:13:19.444Z",
        "__v": 0
    }
}
```

## 123. Resolve the bug

**Endpoint** 
PATCH /api/system-admin/bugs/:id/resolve

**Description** 
Authorized user can mark the bug resolved by using bug id.

**Headers**
Authorization: Bearer <token>  
Content-Type: application/json

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|

Example:

PATCH /api/system-admin/bugs/1/resolve

**Success Response (200)**

```json
{
    "success": true,
    "message": "Bug marked as resolved.",
    "data": {
        "_id": "6a45c8293b6b979109e181da",
        "id": 1,
        "issue": "Message delay",
        "description": "Messages are delayed by 10-15 seconds during peak traffic.",
        "status": "Resolved",
        "severity": "High",
        "assignedDeveloper": "Vimal",
        "resolvedAt": "2026-07-02T02:15:53.142Z",
        "createdAt": "2026-07-02T02:08:41.599Z",
        "updatedAt": "2026-07-02T02:15:53.142Z",
        "__v": 0
    }
}
```

## 124. Register trusted devices

**Endpoint** 
POST /api/trusted-devices/register

**Description** 
Authorized user can add trusted devices for authentication.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field      | Type   | Required | Description                                                                  |
|------------|--------|----------|------------------------------------------------------------------------------|
| deviceId   | String | Yes      | Id for the device                                                            |
| deviceName | String | Yes      | Name of the device                                                           |
| platform   | String | Yes      | Platform from the device registered android, ios, web (windows, linus, mac)  |
| browser    | String | Yes      | Browser used to register                                                     |

Example:

```json
{
  "deviceId": "device-001",
  "deviceName": "Samsung S24",
  "platform": "android",
  "browser": "Chrome"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Trusted device registered successfully",
    "data": {
        "_id": "6a5d975fb95fbd9ef0621e28",
        "user": "69d75d236f48c9b045d574b6",
        "deviceId": "device-001",
        "deviceName": "Samsung S24",
        "platform": "android",
        "browser": "Chrome",
        "ipAddress": "::1",
        "trusted": true,
        "lastLoginAt": "2026-07-20T03:51:44.460Z",
        "createdAt": "2026-07-20T03:34:55.705Z",
        "updatedAt": "2026-07-20T03:51:44.460Z",
        "__v": 0
    }
}
```

## 125. Verify trusted devices

**Endpoint** 
POST /api/trusted-devices/verify

**Description** 
Authorized user can verify the trusted devices for authentication.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field    | Type   | Required | Description       |
|----------|--------|----------|-------------------|
| deviceId | String | Yes      | Id for the device |

Example:

```json
{
  "deviceId": "device-001"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Trusted device verified",
    "data": {
        "_id": "6a5d975fb95fbd9ef0621e28",
        "user": "69d75d236f48c9b045d574b6",
        "deviceId": "device-001",
        "deviceName": "Samsung S24",
        "platform": "android",
        "browser": "Chrome",
        "ipAddress": "::1",
        "trusted": true,
        "lastLoginAt": "2026-07-20T04:08:12.670Z",
        "createdAt": "2026-07-20T03:34:55.705Z",
        "updatedAt": "2026-07-20T04:08:12.670Z",
        "__v": 0
    }
}
```

## 126. List trusted devices

**Endpoint** 
GET /api/trusted-devices/list

**Description** 
Authorized user can view the list of trusted devices.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field    | Type   | Required | Description       |
|----------|--------|----------|-------------------|

Example:

GET /api/trusted-devices/list

**Success Response (200)**

```json
{
    "success": true,
    "count": 1,
    "data": [
        {
            "_id": "6a5d975fb95fbd9ef0621e28",
            "user": "69d75d236f48c9b045d574b6",
            "deviceId": "device-001",
            "deviceName": "Samsung S24",
            "platform": "android",
            "browser": "Chrome",
            "ipAddress": "::1",
            "trusted": true,
            "lastLoginAt": "2026-07-20T04:08:12.670Z",
            "createdAt": "2026-07-20T03:34:55.705Z",
            "updatedAt": "2026-07-20T04:08:12.670Z",
            "__v": 0
        }
    ]
}
```

## 127. Remove trusted devices

**Endpoint** 
DELETE /api/trusted-devices/:deviceId

**Description** 
Authorized user can Delete the trusted devices from lists.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field    | Type   | Required | Description       |
|----------|--------|----------|-------------------|
| deviceId | String | Yes      | Id for the device |

Example:

DELETE /api/trusted-devices/device-001

**Success Response (200)**

```json
{
    "success": true,
    "message": "Trusted device removed successfully"
}
```


## 128. Resend email OTP

**Endpoint** 
POST /api/auth/resend-email-otp

**Description** 
User can resend for OTP after the expiry time through email.
Cooldown of 30 seconds and retry limit of 3 attempts with 5 mins cooldown for limit expiry.

**Headers**

**Request Body**
| Field | Type   | Required | Description            |
|-------|--------|----------|------------------------|
| email | String | Yes      | email id to resend OTP |

Example:

```json
{
    "email": "vio1@gmail.com"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Email OTP resent successfully."
}
```

## 129. Email verification status

**Endpoint** 
GET /api/auth/email-verification-status

**Description** 
Get the status of email verified for the authenticated user.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|

Example:

GET /api/auth/email-verification-status

**Success Response (200)**

```json
{
    "success": true,
    "email": "vimal1@mail.com",
    "isVerified": true
}
```

## 130. Complete login 2FA

**Endpoint** 
POST /api/auth/complete-login-2fa

**Description** 
User can login via 2 Factor authentication.
If 2 Factor authentication was enabled ( SMS or Authenticator).

**Headers**

1. SMS 2FA

**Request Body**
| Field       | Type    | Required | Description                 |
|-------------|---------|----------|-----------------------------|
| userId      | String  | Yes      | userId of the user          |
| idToken     | String  | Yes      | idToken generate using firebase -  const idToken = await user.getIdToken();  |
| trustDevice | Boolean | Yes      | Is trusted device or not    |
| deviceId    | String  | Yes      | Id for the device           |
| deviceName  | String  | Yes      | Name of the device          |
| platform    | String  | Yes      | Platfrom from loging in     |
| browser     | String  | Yes      | browser name                |

Example:

```JSON
{
    "userId": "69d75d236f48c9b045d574b6",
    "idToken": "*********",
    "trustDevice": true,
    "deviceId": "device-001",
    "deviceName": "Samsung S24",
    "platform": "android",
    "browser": "Chrome"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Login successful",
    "user": {
        "settings": {
            "darkMode": false
        },
        "fcmToken": null,
        "_id": "69d75d236f48c9b045d574b6",
        "name": "Ragu",
        "phone": "+913333333333",
        "profilePic": "https://ui-avatars.com/api/?name=User",
        "authProvider": "phone",
        "isProfileComplete": false,
        "isVerified": true,
        "status": "offline",
        "createdAt": "2026-04-09T08:02:43.103Z",
        "updatedAt": "2026-07-20T03:27:34.501Z",
        "lastSeen": "2026-06-22T05:49:21.392Z",
        "blockedBy": [],
        "blockedUsers": [],
        "email": "vimal1@mail.com",
        "fcmStatus": false,
        "isFlagged": false,
        "isSuspended": false,
        "platform": "android",
        "publicKey": "",
        "reportCount": 0,
        "twoFactorEnabled": true,
        "twoFactorMethod": "sms"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZDc1ZDIzNmY0OGM5YjA0NWQ1NzRiNiIsImlhdCI6MTc4NDUyNDg1MywiZXhwIjoxNzg1MTI5NjUzfQ.oqwjcZlGcSRs-UFiXwwpPfe1swb4ckn6OWFClr4hedE",
    "isProfileComplete": false,
    "trustedDevice": {
        "trusted": true
    }
}
```

2. Authenticator 2FA

**Request Body**
| Field       | Type    | Required | Description                |
|-------------|---------|----------|----------------------------|
| userId      | String  | Yes      | userId of the user         |
| authOTP       | String  | Yes      | OTP from authenticator app |
| trustDevice | Boolean | Yes      | Is trusted device or not   |
| deviceId    | String  | Yes      | Id for the device          |
| deviceName  | String  | Yes      | Name of the device         |
| platform    | String  | Yes      | Platfrom from loging in    |
| browser     | String  | Yes      | browser name               |


Example:

```JSON
{
    "userId": "69d75d236f48c9b045d574b6",
    "authOTP": "009037",
    "trustDevice": true,
    "deviceId": "device-001",
    "deviceName": "Samsung S24",
    "platform": "android",
    "browser": "Chrome"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Login successful",
    "user": {
        "settings": {
            "darkMode": false
        },
        "fcmToken": null,
        "_id": "69d75d236f48c9b045d574b6",
        "name": "Ragu",
        "phone": "+913333333333",
        "profilePic": "https://ui-avatars.com/api/?name=User",
        "authProvider": "phone",
        "isProfileComplete": false,
        "isVerified": true,
        "status": "offline",
        "createdAt": "2026-04-09T08:02:43.103Z",
        "updatedAt": "2026-07-20T05:28:51.653Z",
        "lastSeen": "2026-06-22T05:49:21.392Z",
        "blockedBy": [],
        "blockedUsers": [],
        "email": "vimal1@mail.com",
        "fcmStatus": false,
        "isFlagged": false,
        "isSuspended": false,
        "platform": "android",
        "publicKey": "",
        "reportCount": 0,
        "twoFactorEnabled": true,
        "twoFactorMethod": "authenticator"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZDc1ZDIzNmY0OGM5YjA0NWQ1NzRiNiIsImlhdCI6MTc4NDUyNTM2MSwiZXhwIjoxNzg1MTMwMTYxfQ.5fEt_4moHsetHzr3M459H5G7HizA1hf2TpQ0Jor2nSY",
    "isProfileComplete": false,
    "trustedDevice": {
        "trusted": true
    }
}
```

## 131. Generate group invite link

**Endpoint** 
POST /api/group/:groupId/invite-link

**Description** 
Generate a group invite link for the authenticated user.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|

Example:

POST /api/group/6a2fe8214a023f4327e28ffe/invite-link

**Success Response (200)**

```json
{
    "success": true,
    "message": "Invite link generated successfully",
    "inviteLink": "http://localhost:5173/groups/invite/55dd1eb4c1e4cc8385ea2f0f64c566718cc2cdda4ab89d9b76863a28f870914d"
}
```

## 132. Get group invite details

**Endpoint** 
GET /api/group/invite/:token

**Description** 
Get group details of the invited link for the authenticated user.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|

Example:

GET /api/group/invite/55dd1eb4c1e4cc8385ea2f0f64c566718cc2cdda4ab89d9b76863a28f870914d

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "groupId": "6a2fe8214a023f4327e28ffe",
        "groupName": "Test man",
        "description": "My first group1",
        "groupPhoto": "",
        "membersCount": 3
    }
}
```

## 133. join group by invite

**Endpoint** 
POST /api/group/invite/:token/join

**Description** 
Join group by the invited link for the authenticated user.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|

Example:

POST /api/group/invite/55dd1eb4c1e4cc8385ea2f0f64c566718cc2cdda4ab89d9b76863a28f870914d/join

**Success Response (200)**

```json
{
    "success": true,
    "message": "Joined group successfully",
    "groupId": "6a2fe8214a023f4327e28ffe"
}
```

## 134. Revoke Group Invite Link

**Endpoint** 
DELETE /api/group/:groupId/invite-link

**Description** 
Join group by the invited link for the authenticated user.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|

Example:

DELETE /api/group/6a2fe8214a023f4327e28ffe/invite-link

**Success Response (200)**

```json
{
    "success": true,
    "message": "Invite link revoked successfully"
}
```

## 135. Logout users

**Endpoint** 
POST /api/auth/logout

**Description** 
Authorized users can logged out of the device.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|

Example:

POST /api/auth/logout

**Success Response (200)**

```json
{
    "success": true,
    "message": "Logged out successfully"
}
```

## 136. Logout users from all devices

**Endpoint** 
POST /api/auth/logout-all

**Description** 
Authorized users can logged out of all devices.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|

Example:

POST /api/auth/logout-all

**Success Response (200)**

```json
{
    "success": true,
    "message": "Logged out from all devices successfully"
}
```

## 137. Report group

**Endpoint** 
POST /api/report/report-group

**Description** 
Users can report groups.

**Headers**

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
|reporterId     |	String |Yes	     |ID of the user submitting the report |
|reportedGroupId |	String |Yes	     |ID of the group being reported|
|reason	       |String	 |Yes	     |Reason for reporting (e.g., Spam, Harassment, Fake Profile)|
|description	   |  String |No       |	Additional information about the report|

Example:

```json
{
  "reporterId": "69baaafacca583c2bf0d7168",
  "reportedGroupId": "6a7b095d080d2762f361a59d",
  "reason": "Spam",
  "description": "This group is posting spam"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Report submitted successfully",
    "report": {
        "reporterId": "69baaafacca583c2bf0d7168",
        "reportedUserId": null,
        "reportedGroupId": "6a7b095d080d2762f361a59d",
        "reason": "Spam",
        "description": "This group is posting spam",
        "status": "Pending",
        "_id": "6a95606212e00d580ad4a818",
        "createdAt": "2026-08-31T11:07:14.804Z",
        "updatedAt": "2026-08-31T11:07:14.804Z",
        "__v": 0
    }
}
```

## 138. Pin chats

**Endpoint** 
POST /api/chats/pin-chat

**Description** 
Authorized users can pin chats.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
|chatId |	String |Yes	     |ID of the chat needed to pin |

Example:

```json
{
  "chatId": "69d614cac4933b231c58f95b"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Chat pinned"
}
```

## 139. Unpin chats

**Endpoint** 
POST /api/chats/unpin-chat

**Description** 
Authorized users can unpin chats.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
|chatId |	String |Yes	     |ID of the chat needed to unpin |

Example:

```json
{
  "chatId": "69d614cac4933b231c58f95b"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Chat unpinned"
}
```

## 140. Pin groups

**Endpoint** 
POST /api/group/pin-group

**Description** 
Authorized users can pin groups.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
|groupId |	String |Yes	     |ID of the group needed to pin |

Example:

```json
{
  "groupId": "6a75ad5d3102e0f41e2cecbd"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Group pinned"
}
```

## 141. Unpin groups

**Endpoint** 
POST /api/group/unpin-group

**Description** 
Authorized users can unpin groups.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
|groupId |	String |Yes	     |ID of the group needed to unpin |

Example:

```json
{
  "groupId": "6a75ad5d3102e0f41e2cecbd"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Group unpinned"
}
```

## 142. Clear chat

**Endpoint** 
POST /api/chats/clear

**Description** 
Authorized users can clear his chats only for him.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
|chatId |	String |Yes	     |ID of the chat needed to claer chat|

Example:

```json
{
  "chatId": "6a75acaa3102e0f41e2cebe6"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Chat cleared successfully",
    "clearedMessages": 1
}
```

## 143. Clear group chat

**Endpoint** 
POST /api/group/clear-chat

**Description** 
Authorized users can clear his group chats.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
|groupId |	String |Yes	     |ID of the group needed to clear chat|

Example:

```json
{
  "groupId": "6a75ad5d3102e0f41e2cecbd"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Group chat cleared successfully",
    "clearedMessages": 47
}
```

## 144. Delete group chat

**Endpoint** 
POST /api/group/delete-chat

**Description** 
Authorized users can delete his group chats only for him.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
|groupId |	String |Yes	     |ID of the group needed to delete chat|

Example:

```json
{
  "groupId": "6a97b745a03f703151230ab4"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Group chat deleted for you"
}
```

## 145. Delete broadcast

**Endpoint** 
DELETE /api/broadcast/delete-broadcast

**Description** 
Authorized users can delete his broadcasts chats only for him.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field       | Type   | Required | Description                        |
|-------------|--------|----------|------------------------------------|
| broadcastId |	String |Yes	      |ID of the broadcast needed to delete|

Example:

```json
{
  "broadcastId": "6ab4c3038cd536fbfa007b05"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Broadcast deleted successfully"
}
```

## 146. Request to join group

**Endpoint** 
POST /api/group/:groupId/join-requests

**Description** 
Authorized users can send a join request to groups.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field       | Type   | Required | Description     |
|-------------|--------|----------|-----------------|
| groupId     |	String | Yes	    | ID of the group |

Example:

POST /api/group/6ab2077bccf606a59524581d/join-requests

**Success Response (200)**

```json
{
    "success": true,
    "message": "Join request submitted successfully",
    "data": {
        "group": "6ab2077bccf606a59524581d",
        "user": "6a44e1bbc81562ab788d54d6",
        "status": "pending",
        "reviewedBy": null,
        "reviewedAt": null,
        "_id": "6af68d0fa5e2e1050fcfa5a4",
        "requestedAt": "2026-11-13T04:07:43.097Z",
        "createdAt": "2026-11-13T04:07:43.097Z",
        "updatedAt": "2026-11-13T04:07:43.097Z",
        "__v": 0
    }
}
```

## 147. Get join requests

**Endpoint** 
GET /api/group/:groupId/join-requests

**Description** 
Authorized users like Super admin and Admin(If allowed) can receive group join requests.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field       | Type   | Required | Description     |
|-------------|--------|----------|-----------------|
| groupId     |	String | Yes	    | ID of the group |

Example:

GET /api/group/6ab2077bccf606a59524581d/join-requests

**Success Response (200)**

```json
{
    "success": true,
    "count": 1,
    "data": [
        {
            "_id": "6af68d0fa5e2e1050fcfa5a4",
            "group": "6ab2077bccf606a59524581d",
            "user": {
                "_id": "6a44e1bbc81562ab788d54d6",
                "profilePic": "https://ui-avatars.com/api/?name=",
                "name": "ram"
            },
            "status": "pending",
            "reviewedBy": null,
            "reviewedAt": null,
            "requestedAt": "2026-11-13T04:07:43.097Z",
            "createdAt": "2026-11-13T04:07:43.097Z",
            "updatedAt": "2026-11-13T04:07:43.097Z",
            "__v": 0
        }
    ]
}
```

## 148. Review group join request

**Endpoint** 
PUT /api/group/:groupId/join-requests/:requestId/review

**Description** 
Authorized users like Super admin and Admin(If allowed) can approve or reject group join requests.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field       | Type   | Required | Description                  |
|-------------|--------|----------|------------------------------|
| groupId     |	String | Yes	    | ID of the group              |
| requestId   |	String | Yes	    | ID of the review requested   |
| action      |	String | Yes	    | accept or reject the request |

Example:

PUT /api/group/6ab2077bccf606a59524581d/join-requests/6af68d0fa5e2e1050fcfa5a4/review

AND

```json
{
  "action": "reject"
}
```

OR

```json
{
  "action": "approve"
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Join request rejected successfully",
    "data": {
        "_id": "6af68d0fa5e2e1050fcfa5a4",
        "group": "6ab2077bccf606a59524581d",
        "user": "6a44e1bbc81562ab788d54d6",
        "status": "rejected",
        "reviewedBy": "6a423a389d8ee14842eb4784",
        "reviewedAt": "2026-11-13T04:09:37.069Z",
        "requestedAt": "2026-11-13T04:07:43.097Z",
        "createdAt": "2026-11-13T04:07:43.097Z",
        "updatedAt": "2026-11-13T04:09:37.069Z",
        "__v": 0
    }
}
```

OR

```json
{
    "success": true,
    "message": "Join request approved successfully",
    "data": {
        "_id": "6af69379a5e2e1050fcfa5c9",
        "group": "6ab2077bccf606a59524581d",
        "user": "6a44e1bbc81562ab788d54d6",
        "status": "approved",
        "reviewedBy": "6a423a389d8ee14842eb4784",
        "reviewedAt": "2026-11-13T04:40:11.669Z",
        "requestedAt": "2026-11-13T04:35:05.190Z",
        "createdAt": "2026-11-13T04:35:05.191Z",
        "updatedAt": "2026-11-13T04:40:11.669Z",
        "__v": 0
    }
}
```

## 149. Get group permissions

**Endpoint** 
GET /api/group/permissions/:groupId

**Description** 
Authorized users can get the group permissions, but only Superadmin can update.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field       | Type   | Required | Description     |
|-------------|--------|----------|-----------------|
| groupId     |	String | Yes	    | ID of the group |

Example:

GET /api/group/permissions/6ab2077bccf606a59524581d

**Success Response (200)**

```json
{
    "success": true,
    "data": {
        "groupId": "6ab2077bccf606a59524581d",
        "rolePermissions": {
            "member": {
                "addMembers": false
            },
            "moderator": {
                "addMembers": true,
                "assignRoles": false,
                "pinMessages": false,
                "editGroupInfo": false
            },
            "admin": {
                "approveJoinRequests": false
            }
        }
    }
}
```

## 150. Update group permissions

**Endpoint** 
PUT /api/group/permissions/:groupId

**Description** 
Authorized users can get the group permissions, but only Superadmin can update.

**Headers**
Authorization: Bearer <token>

**Request Body**
| Field               | Type    | Required | Description                                                  |
|---------------------|---------|----------|--------------------------------------------------------------|
| groupId             |	String  | Yes	     | ID of the group                                              |
| addMember           |	Boolean | No	     | Can members add others                                       |
| addMember           |	Boolean | No	     | Can moderators add others                                    |
| assignRoles         |	Boolean | No	     | Can moderators assign roles to others                        |
| pinMessages         |	Boolean | No	     | Can moderators pin messages                                  |
| editGroupInfo       |	Boolean | No	     | Can moderators edit group name, description, profile picture |
| approveJoinRequests |	Boolean | No	     | Can admin approve or reject requests                         |

Example:

PUT /api/group/permissions/6ab2077bccf606a59524581d

```json
{
  "rolePermissions": {
    "member": {
      "addMembers": false
    },
    "moderator": {
      "addMembers": true,
      "assignRoles": false,
      "pinMessages": false,
      "editGroupInfo": false
    },
    "admin": {
      "approveJoinRequests": false
    }
  }
}
```

**Success Response (200)**

```json
{
    "success": true,
    "message": "Group permissions updated successfully",
    "data": {
        "groupId": "6ab2077bccf606a59524581d",
        "rolePermissions": {
            "member": {
                "addMembers": false
            },
            "moderator": {
                "addMembers": true,
                "assignRoles": false,
                "pinMessages": false,
                "editGroupInfo": false
            },
            "admin": {
                "approveJoinRequests": false
            }
        }
    }
}
```
