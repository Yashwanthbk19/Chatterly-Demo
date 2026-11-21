# 📱 Chatterly Backend – Contacts Sync System Documentation

---

## 🔹 Overview

The Contacts Sync feature allows users to:

- Upload their phone contacts
- Match contacts with registered users in the system
- Display available users for chat

---

## 🔹 Endpoint

POST http://localhost:5000/api/contacts/sync

---

## 🔹 Request Headers

| Key | Value |
|-----|------|
| Authorization | Bearer <JWT_TOKEN> |
| Content-Type | application/json |

---

## 🔹 Request Body

json
{
  "contacts": [
    {
      "name": "John Doe",
      "phone": "9876543210"
    },
    {
      "name": "Jane Smith",
      "phone": "9123456780"
    }
  ]
}

---

## 🔹 Positive Flow

- User sends contact list
- Backend checks phone numbers in database
- Matching users are identified
- Only registered users are returned in response

---

## 🔹 Response Example

{
  "matchedContacts": [
    {
      "name": "John Doe",
      "phone": "9876543210",
      "userId": "abc123"
    }
  ]
}

---

## 🔹 Negative Test Cases

- Empty contacts list → Validation error
- Invalid phone number format → Error response
- Unauthorized request (missing token) → 401 error
- Server error → 500 response

---

## 🔹 Security Considerations

- API requires JWT authentication
- Contacts data should not be stored permanently (if not      required)
- Sensitive data must be handled securely

---

## 🔹 Notes

- Only users registered in the system will be matched
- Phone numbers should be normalized before matching
- Use JWT token obtained from login APIs for testing

---

## 🔹 Future Enhancements

- Auto-sync contacts periodically
- Add pagination for large contact lists
- Improve matching with country codes

---

