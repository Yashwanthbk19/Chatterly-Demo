# Chatterly Backend – Test Cases

## 🔹 Base URL
http://localhost:5000/api/auth

---

# ✅ 1. Health Check API

**Endpoint:** GET http://localhost:5000/health

### Test Cases

* Verify status code is **200**
* Verify response contains:
  ```json
  { "status": "OK" }

* Verify API responds within acceptable time

# ✅ 2. Send Email OTP

**Endpoint:** POST http://localhost:5000/api/auth/send-email-otp

## Positive Test Cases
- Valid email → OTP sent successfully
- Response contains success message

## Negative Test Cases
- Invalid email format → Error response
- Empty email field → Validation error
- Missing request body → Error

---

# ✅ 3. Verify Email OTP

**Endpoint:** POST http://localhost:5000/api/auth/verify-email-otp

## Positive Test Cases
- Correct OTP → Email verified successfully
- Response contains:
   - User object
   - JWT token
- Token should not be null or empty

## Negative Test Cases
- Incorrect OTP → Verification failed
- Expired OTP → Error response
- Missing fields (email/otp/password) → Validation error

---

# ✅ 4. Login User

**Endpoint:** POST http://localhost:5000/api/auth/login

## Positive Test Cases
- Valid email & password → Login successful
- Response contains:
    - User object
    - JWT token
- Token should not be null or empty

## Negative Test Cases
- Incorrect password → Unauthorized error
- Unregistered email → User not found error
- Empty email/password → Validation error

---

# 🟡 5. Phone Login (Firebase OTP)

**Endpoint:** POST http://localhost:5000/api/auth/phone-login

### Planned Test Cases

* Valid phone number + correct OTP → Login successful  
* Invalid phone number → Validation error  
* Incorrect OTP → Authentication failure  
* Expired OTP → Error response  
* Missing phone/OTP → Validation error  
* Verify Firebase OTP verification flow  

**Status:** Pending / Awaiting Backend Confirmation

# 🟡 6. Google Login

**Endpoint:** POST http://localhost:5000/api/auth/google-login

### Planned Test Cases

* Valid Google token → Login successful  
* New user via Google → Account creation  
* Existing user via Google → Login successful  
* Invalid/expired token → Authentication failure  
* Missing token → Validation error  

**Status:** Pending / Awaiting Backend Confirmation

# ✅ 7. Update Profile

**Endpoint:** PATCH http://localhost:5000/api/auth/update-profile

## Positive Test Cases

* Update name successfully
* Update status successfully
* Upload profile picture successfully
* Remove profile picture successfully
* Enable darkMode = true successfully
* Disable darkMode = false successfully

## Negative Test Cases

* Invalid email format → Validation error
* Duplicate email → Error response
* Invalid phone number → Validation error
* File size greater than 2MB → Error response

## Validation Checks

* User profile updates successfully
* settings.darkMode value is saved correctly
* Profile picture removed successfully when removeProfilePic = true
* Existing profile data remains unchanged when optional fields are omitted
