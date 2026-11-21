import normalizePhone from "../utils/normalizePhone.js";
import redisClient from "../config/redis.js";

const RESEND_COOLDOWN = 30;
const ATTEMPT_WINDOW = 300;
const MAX_RESENDS = 3;

const getResendKey = (phone) =>
    `sms_resend:${phone}`;

const getAttemptKey = (phone) =>
    `sms_attempts:${phone}`;

// Check whether resend is allowed
export const allowResendOtp = async (phone) => {
    phone = normalizePhone(phone);
    const cooldown = await redisClient.get(
        getResendKey(phone)
    );

    if (cooldown) {
        throw new Error(
            "Please wait 30 seconds before requesting another OTP."
        );
    }

    const attempts = Number(
        await redisClient.get(
            getAttemptKey(phone)
        )
    ) || 0;

    if (attempts >= MAX_RESENDS) {
        throw new Error(
            "Maximum resend attempts reached. Please try again after 5 minutes."
        );
    }

    await redisClient.set(
        getResendKey(phone),
        "1",
        {
            EX: RESEND_COOLDOWN
        }
    );

    await redisClient.incr(
        getAttemptKey(phone)
    );

    await redisClient.expire(
        getAttemptKey(phone),
        ATTEMPT_WINDOW
    );

    return true;
};
