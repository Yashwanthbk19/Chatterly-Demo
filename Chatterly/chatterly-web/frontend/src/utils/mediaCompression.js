export const COMPRESSION_STAGES = {
  PENDING: 'pending',
  COMPRESSING: 'compressing',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const compressImage = (canvas, quality = 0.8) => {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
};

const resizeImage = (file, maxWidth = 1920, maxHeight = 1080) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = async () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;

          if (width > maxWidth) {
            width = maxWidth;
            height = Math.round(width / aspectRatio);
          }

          if (height > maxHeight) {
            height = maxHeight;
            width = Math.round(height * aspectRatio);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBlob = await compressImage(canvas, 0.85);
        resolve({
          blob: compressedBlob,
          width,
          height,
          originalSize: file.size,
          compressedSize: compressedBlob.size,
          compressionRatio: ((1 - compressedBlob.size / file.size) * 100).toFixed(2),
        });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target.result;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
};

export const compressMedia = async (
  file,
  onStageChange = null,
  simulationDelay = 2000
) => {
  try {
    const mimeType = String(file.type || '').toLowerCase();

    if (!mimeType.startsWith('image/')) {
      return {
        success: true,
        file,
        blob: file,
        compressed: false,
        reason: 'Not an image file',
      };
    }

    onStageChange?.(COMPRESSION_STAGES.COMPRESSING);

    const compresionResult = await resizeImage(file);

    await new Promise((resolve) => {
      setTimeout(resolve, simulationDelay);
    });

    const compressedFile = new File([compresionResult.blob], file.name, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    onStageChange?.(COMPRESSION_STAGES.UPLOADING);

    return {
      success: true,
      file: compressedFile,
      blob: compresionResult.blob,
      compressed: true,
      stats: {
        originalSize: compresionResult.originalSize,
        compressedSize: compresionResult.compressedSize,
        compressionRatio: compresionResult.compressionRatio,
        width: compresionResult.width,
        height: compresionResult.height,
      },
    };
  } catch (error) {
    onStageChange?.(COMPRESSION_STAGES.FAILED);
    return {
      success: false,
      error: error.message || 'Compression failed',
      file,
    };
  }
};

export const createPreviewFromBlob = (blob) => {
  return URL.createObjectURL(blob);
};

export const revokePreviewUrl = (url) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};
