import admin from "../config/firebase.js";
import User from "../models/User.js";
import generateToken from "../utils/jwt.js";
import emailService from "../services/emailService.js";
import logger from "../middleware/logger.js";
import { deleteFromS3 } from "../utils/s3Delete.js";
import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../config/s3.js";
import normalizePhone from "../utils/normalizePhone.js";
import path from "path";
import mongoose from "mongoose";
import { handleTrustedDeviceLogin } from "../services/trustedDeviceService.js";
import { allowResendOtp } from "../services/smsVerificationService.js";
import speakeasy from "speakeasy";
import { registerTrustedDevice } from "../services/trustedDeviceService.js";
import jwt from "jsonwebtoken";
import {
  revokeSession,
  addSession,
  removeSession,
  getUserSessions,
  refreshSessionActivity
} from "../services/sessionService.js";
import redisClient from "../config/redis.js";

// ✅ Allowed types
const allowedTypes = [
  "image/png",
  "image/jpg",
  "image/jpeg"
];

// ✅ Multer setup with validation
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },

  fileFilter: (req, file, cb) => {
    try {
      // Validate mime type
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(
          new Error(
            "Only JPG, JPEG, and PNG images are allowed"
          ),
          false
        );
      }

      // Validate extension
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExt = [".jpg", ".jpeg", ".png"];

      if (!allowedExt.includes(ext)) {
        return cb(
          new Error(
            "Invalid file extension. Only JPG, JPEG, and PNG are allowed"
          ),
          false
        );
      }

      cb(null, true);
    }
    catch (error) {
      cb(error, false);
    }
  },

  storage: multerS3({
    s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,

    metadata: (req, file, cb) => {
      cb(null, {
        fieldName: file.fieldname,
      });
    },

    key: (req, file, cb) => {
      const uniqueName = `profiles/${Date.now()}-${file.originalname.replace(
        /\s+/g,
        "-"
      )}`;

      cb(null, uniqueName);
    },
  }),
}).single("profilePic");

// Phone Number login
export const firebasePhoneLogin = async (req, res) => {
  const {
    idToken,
    deviceId
  } = req.body;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const phone = decoded.phone_number;

    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        phone,
        authProvider: "phone",
        isVerified: true,
        isProfileComplete: false
      });
    }

    const trustedDevice = await handleTrustedDeviceLogin({
      userId: user._id,
      deviceId
    });

    // Only require an extra step if the second factor is an authenticator app
    if (
      user.twoFactorEnabled &&
      !trustedDevice.trusted
    ) {
      return res.status(200).json({
        success: true,
        requires2FA: true,
        userId: user._id,
        twoFactorMethod: user.twoFactorMethod,
        trustedDevice
      });
    }

    // Trusted device OR 2FA disabled
    const safeUser = user.toObject();

    delete safeUser.privateKey;
    delete safeUser.authenticatorSecret;
    delete safeUser.backupCodes;
    delete safeUser.twoFactorOtp;
    delete safeUser.twoFactorOtpExpires;
    delete safeUser.__v;

    const { token, jti, exp } = generateToken(user._id);

    await addSession(user._id.toString(), jti, exp);
    await refreshSessionActivity(jti);

    return res.status(200).json({
      success: true,
      user: safeUser,
      token,
      isProfileComplete: user.isProfileComplete,
      trustedDevice
    });
  }
  catch (err) {
    res.status(401).json({
      success: false,
      message: "Invalid Firebase token"
    });
  }
};

// Social Login
export const googleLogin = async (req, res) => {
  const {
    idToken,
    deviceId
  } = req.body;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = decoded.email;
    const name = decoded.name;
    const picture = decoded.picture;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        profilePic: picture,
        authProvider: "google",
        isVerified: true,
        isProfileComplete: false
      });
    }

    const trustedDevice = await handleTrustedDeviceLogin({
      userId: user._id,
      deviceId
    });

    // Require authenticator only if enabled and device is not trusted
    if (
      user.twoFactorEnabled &&
      !trustedDevice.trusted
    ) {
      return res.status(200).json({
        success: true,
        requires2FA: true,
        userId: user._id,
        twoFactorMethod: user.twoFactorMethod,
        trustedDevice
      });
    }

    const safeUser = user.toObject();

    delete safeUser.privateKey;
    delete safeUser.authenticatorSecret;
    delete safeUser.backupCodes;
    delete safeUser.twoFactorOtp;
    delete safeUser.twoFactorOtpExpires;
    delete safeUser.__v;

    const { token, jti, exp } = generateToken(user._id);

    await addSession(user._id.toString(), jti, exp);
    await refreshSessionActivity(jti);

    return res.status(200).json({
      success: true,
      user: safeUser,
      token,
      isProfileComplete: user.isProfileComplete,
      trustedDevice
    });
  }
  catch (err) {
    res.status(401).json({ message: "Invalid Google token" });
  }
};

// SEND EMAIL OTP
export const sendEmailOtp = async (req, res) => {
  const { email } = req.body;
  try {
    await emailService.sendEmailOtp(email);
    logger.info(`OTP sent to email: ${email}`);
    res.json({ message: "OTP sent to email" });
  }
  catch (err) {
    logger.error(`Send OTP failed: ${err.message}`);

    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// EMAIL VERIFY + REGISTER
export const verifyEmailOtp = async (req, res) => {
  const {
    email,
    otp,
    deviceId
  } = req.body;

  const valid = await emailService.verifyEmailOtp(email, otp);

  if (!valid) {
    logger.warn(`OTP verification failed: ${email}`);
    return res.status(400).json({ message: "Invalid or expired OTP." });
  }

  let user = await User.findOne({ email });
  let status = "authenticated";

  if (!user) {
    status = "created";
    user = await User.create({
      email,
      authProvider: "email",
      isVerified: true,
      isProfileComplete: false,
    });
    logger.info(`User registered via email: ${email}`);
  }

  // Send welcome email
  await emailService.sendWelcomeEmail(user.email, user.name, status);
  logger.info(`Welcome email sent to: ${user.email}`);

  const trustedDevice = await handleTrustedDeviceLogin({
    userId: user._id,
    deviceId
  });

  if (
    user.twoFactorEnabled &&
    !trustedDevice.trusted
  ) {
    return res.status(200).json({
      success: true,
      requires2FA: true,
      userId: user._id,
      twoFactorMethod: user.twoFactorMethod,
      trustedDevice
    });
  }

  const safeUser = user.toObject();

  delete safeUser.privateKey;
  delete safeUser.authenticatorSecret;
  delete safeUser.backupCodes;
  delete safeUser.twoFactorOtp;
  delete safeUser.twoFactorOtpExpires;
  delete safeUser.__v;

  const { token, jti, exp } = generateToken(user._id);

  await addSession(user._id.toString(), jti, exp);
  await refreshSessionActivity(jti);

  return res.status(200).json({
    success: true,
    user: safeUser,
    token,
    isProfileComplete: user.isProfileComplete,
    trustedDevice
  });
};

// Resend Email OTP
export const resendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    await emailService.sendEmailOtp(email);

    return res.status(200).json({
      success: true,
      message: "Email OTP resent successfully."
    });
  }
  catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Email Verification Status
export const emailVerificationStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      email: user.email,
      isVerified: user.isVerified
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Complete login after 2FA verification
export const completeLogin2FA = async (req, res) => {
  try {
    const {
      userId,
      authOTP,
      idToken = false,
      trustDevice = false,
      deviceId,
      deviceName,
      platform,
      browser
    } = req.body;

    let user = await User.findById(userId);

    if (idToken) {
      const decoded = await admin.auth().verifyIdToken(idToken);
      const phone = decoded.phone_number;
      user = await User.findOne({ phone });
    }


    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (
      trustDevice &&
      (!deviceId || !deviceName || !platform)
    ) {
      return res.status(400).json({
        success: false,
        message: "deviceId, deviceName and platform are required when trusting a device."
      });
    }

    // Verify Second Factor
    if (user.twoFactorMethod === "authenticator") {
      const verified = speakeasy.totp.verify({
        secret: user.authenticatorSecret,
        encoding: "base32",
        token: authOTP
      });

      if (!verified) {
        return res.status(400).json({
          success: false,
          message: "Invalid authenticator code"
        });
      }
    }
    else if (user.twoFactorMethod === "sms") {
      if (!idToken) {
        return res.status(400).json({
          success: false,
          message: "Firebase idToken is required"
        });
      }

      const decoded = await admin.auth().verifyIdToken(idToken);

      if (decoded.phone_number !== user.phone) {
        return res.status(401).json({
          success: false,
          message: "Phone verification failed"
        });
      }
    }

    // Register trusted device only if user selected it
    if (
      trustDevice &&
      deviceId &&
      deviceName &&
      platform
    ) {
      await registerTrustedDevice({
        userId: user._id,
        deviceId,
        deviceName,
        platform,
        browser,
        ipAddress: req.ip
      });
    }

    const safeUser = user.toObject();

    delete safeUser.privateKey;
    delete safeUser.authenticatorSecret;
    delete safeUser.backupCodes;
    delete safeUser.twoFactorOtp;
    delete safeUser.twoFactorOtpExpires;
    delete safeUser.__v;

    const { token, jti, exp } = generateToken(user._id);

    await addSession(user._id.toString(), jti, exp);
    await refreshSessionActivity(jti);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: safeUser,
      token,
      isProfileComplete: user.isProfileComplete,
      trustedDevice: {
        trusted: trustDevice
      }
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create profile
export const createProfile = async (req, res) => {
  upload(req, res, async (err) => {
    // 🔴 Handle multer errors
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File size must be less than 2MB" });
      }
      return res.status(400).json({ message: err.message });
    }

    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const userId = req.user.id;
      const { name, status, email, phone } = req.body;

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.isProfileComplete) {
        return res.status(400).json({
          message: "Profile already completed",
        });
      }

      // Phone Login
      if (user.authProvider === "phone") {
        if (email) {
          const normalizedEmail = email.trim().toLowerCase();
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

          if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
              message: "Invalid email format"
            });
          }

          const existingEmail = await User.findOne({
            email: normalizedEmail,
            _id: { $ne: userId }
          });

          if (existingEmail) {
            return res.status(400).json({
              message: "Email already in use"
            });
          }

          user.email = normalizedEmail;
        }
      }

      // Google Login
      if (
        user.authProvider === "google" ||
        user.authProvider === "email"
      ) {
        if (phone) {
          const normalizedPhone = normalizePhone(phone);
          const phoneRegex = /^\+91\d{10}$/;

          if (!phoneRegex.test(normalizedPhone)) {
            return res.status(400).json({
              message: "Invalid phone number"
            });
          }

          const existingPhone = await User.findOne({
            phone: normalizedPhone,
            _id: { $ne: userId }
          });

          if (existingPhone) {
            return res.status(400).json({
              message: "Phone already in use"
            });
          }

          user.phone = normalizedPhone;
        }
      }

      // ✅ File handling
      const profilePic = req.file ? req.file.location : undefined;

      user.name = name;
      user.profilePic = profilePic || user.profilePic || user.avatar;
      user.status = status || "Hey there! I'm using Chatterly";
      user.isProfileComplete = true;

      await user.save();

      return res.json({
        message: "Profile created successfully",
        user,
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  });
};

// Update profile
export const updateProfile = async (req, res) => {
  upload(req, res, async (err) => {
    // 🔴 Handle multer errors
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File size must be less than 2MB" });
      }
      return res.status(400).json({ message: err.message });
    }

    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const userId = req.user.id;
      let { name, status, email, phone, removeProfilePic, darkMode } = req.body;

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update only if value is provided
      // Name validation
      if (name !== undefined && name.trim() !== "") {
        name = name.trim();

        if (name.length < 2) {
          return res.status(400).json({ message: "Name must be atleast 2 characters" });
        }

        if (name.length > 30) {
          return res.status(400).json({ message: "Name cannot exceed 30 characters" });
        }

        //Duplicate username
        const existingName = await User.findOne({
          name,
          _id: { $ne: userId }
        });

        if (existingName) {
          return res.status(400).json({ message: "Username already exists" });
        }

        user.name = name;
      }

      // Status validation
      if (status !== undefined) {
        status = status.trim();

        if (status.length > 150) {
          return res.status(400).json({ message: "Status too long" });
        }

        user.status = status;
      }

      //Email validation
      if (email !== undefined) {
        email = email.trim().toLowerCase();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
          return res.status(400).json({ message: "Invalid email format" });
        }

        // duplicate email
        const existingEmail = await User.findOne({
          email,
          _id: { $ne: userId }
        });

        if (existingEmail) {
          return res.status(400).json({ message: "Email already in use" });
        }

        user.email = email;
      }

      // Phone validation
      if (phone !== undefined) {
        phone = normalizePhone(phone);
        const phoneRegex = /^\+91\d{10}$/;

        if (!phoneRegex.test(phone)) {
          return res.status(400).json({ message: "Invalid phone number" });
        }

        // duplicate phone
        const existingPhone = await User.findOne({
          phone,
          _id: { $ne: userId }
        });

        if (existingPhone) {
          return res.status(400).json({ message: "Phone already in use" });
        }

        user.phone = phone;
      }

      // Profice pic
      if (req.file) {

        // Delete old Pic
        if (
          user.profilePic &&
          user.profilePic.includes(
            process.env.AWS_S3_BUCKET_NAME
          )
        ) {
          await deleteFromS3(user.profilePic);
        }

        // Uploded file URL
        user.profilePic = req.file.location;
      }

      // Remove profile pic
      if (removeProfilePic === "true") {
        if (
          user.profilePic &&
          user.profilePic.includes(process.env.AWS_S3_BUCKET_NAME)
        ) {
          await deleteFromS3(user.profilePic);
        }

        user.profilePic = "";
      }

      if (darkMode !== undefined) {
        user.settings.darkMode = darkMode === true || darkMode === "true";
      }

      await user.save();

      // Socket emit
      const io = req.app.get("io");

      if (io) {
        io.emit("profile_updated", {
          userId: user._id,
          name: user.name,
          profilePic: user.profilePic,
          status: user.status
        });
      }

      return res.json({
        message: "Profile updated successfully",
        user,
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Server error" });
    }
  });
};

// Search users (ID / Name / Phone / Email)
export const authSearchUsers = async (req, res) => {
  try {
    const keyword = req.query.q;

    if (!keyword?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Search keyword is required"
      });
    }

    const users = await User.find({
      $or: [
        { name: { $regex: keyword, $options: "i" } },
        { phone: { $regex: keyword, $options: "i" } },
        { email: { $regex: keyword, $options: "i" } },
        {
          _id: mongoose.Types.ObjectId.isValid(keyword)
            ? keyword
            : null
        }
      ]
    })
      .select("_id name email phone profilePic")
      .limit(20);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Logout User
export const logoutUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    await revokeSession(decoded.jti, decoded.exp);

    // Remove this session from active sessions
    await removeSession(decoded.id, decoded.jti);

    // Disconnect all sockets
    const io = req.app.get("io");

    if (io) {
      io.to(decoded.id.toString()).disconnectSockets(true);
    }

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Logout all devices
export const logoutAllDevices = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const sessions = await getUserSessions(decoded.id);

    for (const session of sessions) {
      const { jti, exp } = JSON.parse(session);

      await revokeSession(jti, exp);
    }

    // Remove all active sessions
    await redisClient.del(`user_sessions:${decoded.id}`);

    // Disconnect all sockets
    const io = req.app.get("io");

    if (io) {
      io.to(decoded.id.toString()).disconnectSockets(true);
    }

    return res.status(200).json({
      success: true,
      message: "Logged out from all devices successfully"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
