import sharp from "sharp";
import fs from "fs";
import path from "path";

export const compressImage = async (file) => {
  try {
    // Create new filename
    const newFileName = "compressed-" + file.filename;
    const outputPath = path.join("src/uploads", newFileName);

    // Compress image
    await sharp(file.path)
      .resize(800) // width resize
      .jpeg({ quality: 70 }) // reduce quality
      .toFile(outputPath);

    // Delete original file
    fs.unlinkSync(file.path);

    return {
      filename: newFileName,
      path: outputPath
    };

  } catch (error) {
    throw new Error("Compression failed");
  }
};