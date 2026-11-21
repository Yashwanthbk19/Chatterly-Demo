import jwt from "jsonwebtoken";
import crypto from "crypto";

const generateToken = (userId) => {
  const jti = crypto.randomUUID();
  const expiresIn = "7d";

  const token = jwt.sign(
    {
      id: userId,
      jti
    },
    process.env.JWT_SECRET,
    {
      expiresIn
    }
  );

  const { exp } = jwt.decode(token);

  return {
    token,
    jti,
    exp
  };
};

export default generateToken;