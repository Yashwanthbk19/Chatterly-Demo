import nodemailer from "nodemailer";
import crypto from "crypto";
import redisClient from "../config/redis.js";
import generateOTP from "../utils/generateOtp.js";
import verifyOtpTemplate from "../templates/email/verifyOtpTemplate.js";
import welcomeTemplate from "../templates/email/welcomeTemplate.js";

const OTP_TTL = 300;
const COOLDOWN_TTL = 30;
const MAX_ATTEMPTS = 3;

const hashOTP = (otp) => {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
};

const getKey = (email) => `email_otp:${email}`;

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});


// SEND OTP
export const sendEmailOtp = async (email, otp = null) => {

  const key = getKey(email);

  const cooldown = await redisClient.get(`cooldown:${key}`);

  if (cooldown && !otp) {
    throw new Error(
      "Please wait before requesting another OTP"
    );
  }

  // Use passed OTP or generate new one
  const finalOtp =
    otp || generateOTP().toString();

  const hashedOtp = hashOTP(finalOtp);

  const template =
    verifyOtpTemplate(finalOtp);

  await redisClient.set(
    key,
    hashedOtp,
    { EX: OTP_TTL }
  );

  await redisClient.set(
    `attempts:${key}`,
    0,
    { EX: OTP_TTL }
  );

  await redisClient.set(
    `cooldown:${key}`,
    "1",
    { EX: COOLDOWN_TTL }
  );

  await transporter.sendMail({
    from: `"Chatterly" <${process.env.MAIL_USER}>`,
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  console.log("OTP Sent:", finalOtp);

  return true;
};


// VERIFY OTP
export const verifyEmailOtp = async (email, otp) => {
  const key = getKey(email);

  const storedHash = await redisClient.get(key);
  if (!storedHash) return false;

  const attemptsKey = `attempts:${key}`;
  const attempts = await redisClient.get(attemptsKey);

  if (Number(attempts) >= MAX_ATTEMPTS) {
    throw new Error("Maximum attempts reached");
  }

  const hashedInput = hashOTP(otp);

  if (hashedInput !== storedHash) {
    await redisClient.incr(attemptsKey);
    return false;
  }

  await redisClient.del(key);
  await redisClient.del(attemptsKey);

  return true;
};

// SEND WELCOME EMAIL
export const sendWelcomeEmail = async (email, name, status) => {
  const template = welcomeTemplate(name, status);

  await transporter.sendMail({
    from: `"Chatterly" <${process.env.MAIL_USER}>`,
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  return true;
};

export default {
  sendEmailOtp,
  verifyEmailOtp,
  sendWelcomeEmail,
};