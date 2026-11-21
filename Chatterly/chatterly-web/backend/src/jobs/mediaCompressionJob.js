import fs from "fs";
import os from "os";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import s3 from "../config/s3.js";
import { getIO } from "../sockets/socketServer.js";
import {
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand
} from "@aws-sdk/client-s3";
import Message from "../models/Message.js";

ffmpeg.setFfmpegPath(ffmpegPath);

async function streamToBuffer(stream) {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

export const compressVideoInBackground = async (
    messageId,
    uniqueId,
    originalKey
) => {
    try {
        console.log("Background compression started:", messageId);
        const tempInput = path.join(
            os.tmpdir(),
            `${uniqueId}-input.mp4`
        );

        const tempCompressed = path.join(
            os.tmpdir(),
            `${uniqueId}-compressed.mp4`
        );

        const tempThumb = path.join(
            os.tmpdir(),
            `${uniqueId}-thumb.jpg`
        );

        // Download original from S3
        const originalObject = await s3.send(
            new GetObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: originalKey
            })
        );

        const buffer = await streamToBuffer(originalObject.Body);

        fs.writeFileSync(
            tempInput,
            buffer
        );
        console.log("Original video downloaded");

        // Compress video
        await new Promise((resolve, reject) => {
            ffmpeg(tempInput).outputOptions([
                "-vcodec libx264",
                "-crf 28",
                "-preset ultrafast",
                "-movflags +faststart"
            ])
            .size("854x?")
            .on("start", cmd => {
                console.log("FFmpeg Started:", cmd);
            })
            .on("progress", progress => {
                console.log("FFmpeg Progress:", progress);
            })
            .on("end", resolve)
            .on("error", reject)
            .save(tempCompressed);
        });
        console.log("Video compressed");

        // Generate thumbnail
        await new Promise((resolve, reject) => {
            ffmpeg(tempCompressed).screenshots({
                timestamps: ["1"],
                filename: path.basename(tempThumb),
                folder: path.dirname(tempThumb),
                size: "320x?"
            })
            .on("end", resolve)
            .on("error", reject);
        });
        console.log("Thumbnail created");

        // Upload compressed video
        const compressedBuffer = fs.readFileSync(tempCompressed);
        const compressedKey = `media/compressed/${uniqueId}.mp4`;

        await s3.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: compressedKey,
                Body: compressedBuffer,
                ContentType: "video/mp4"
            })
        );
        console.log("Compressed uploaded");

        console.log(
            "Compressed Size:",
            (compressedBuffer.length / 1024 / 1024).toFixed(2),"MB"
        );

        // Upload thumbnail
        const thumbBuffer = fs.readFileSync(tempThumb);
        const thumbKey = `thumbs/${uniqueId}.jpg`;

        await s3.send(
            new PutObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: thumbKey,
                Body: thumbBuffer,
                ContentType: "image/jpeg"
            })
        );
        console.log("Thumbnail uploaded");

        // URLs
        const mediaUrl =`https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${compressedKey}`;
        const thumbnailUrl =`https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${thumbKey}`;

        const updatedMessage = await Message.findByIdAndUpdate(
            messageId,
            {
                mediaUrl,
                thumbnailUrl,
                mediaSize: compressedBuffer.length
            },
            {
                returnDocument: "after"
            }
        );
        console.log("Mongo updated");

        const io = getIO();

        if (io && updatedMessage) {
            // Group chat
            if (updatedMessage.groupId) {
                io.to(
                    updatedMessage.groupId.toString()
                ).emit(
                    "group_media_compressed",
                    {
                        messageId: updatedMessage._id,
                        mediaUrl,
                        thumbnailUrl,
                        mediaSize: compressedBuffer.length
                    }
                );
            }
            // Private chat
            else {
                const roomId = [
                    String(updatedMessage.sender),
                    String(updatedMessage.receiver)
                ]
                .sort().join("_");

                io.to(roomId).emit(
                    "media_compressed",
                    {
                        messageId: updatedMessage._id,
                        mediaUrl,
                        thumbnailUrl,
                        mediaSize: compressedBuffer.length
                    }
                );
            }
        }
        console.log("Compression socket emitted");

        // Delete original S3 file
        await s3.send(
            new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: originalKey
            })
        );
        console.log("Original deleted");

        [
            tempInput,
            tempCompressed,
            tempThumb
        ].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
        console.log("Cleanup done");
    }
    catch (error) {
        console.log("Background compression failed", error);
    }
};
