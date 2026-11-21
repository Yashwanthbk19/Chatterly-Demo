import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../config/s3.js";

export const deleteFromS3 = async (fileUrl) => {
  try {
    if (!fileUrl) return;

    const key = fileUrl.split(".com/")[1]; // extract path

    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    });

    await s3.send(command);
  } catch (err) {
    console.error("S3 Delete Error:", err.message);
  }
};

// Delete media
const deleteMediaFromS3 = async (fileUrl) => {
  try {

    if (!fileUrl) return;

    const url = new URL(fileUrl);

    const key = decodeURIComponent(
      url.pathname.substring(1)
    );

    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key
      })
    );

    console.log(`Deleted from S3: ${key}`);

  } catch (error) {
    console.log("S3 delete error:", error.message);
  }
};

export default deleteMediaFromS3;