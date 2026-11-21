import React, { useEffect, useRef, useState } from 'react';

const PREVIEW_MAX_WIDTH = 460;
const PREVIEW_MAX_HEIGHT = 420;
const CROP_OUTPUT_MAX_WIDTH = 1080;
const MIN_CROP_SIZE = 96;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load the selected image.'));
    image.src = src;
  });

const canvasToBlob = (canvas, mimeType) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Unable to update the selected image.'));
        }
      },
      mimeType,
      0.92
    );
  });

const getDisplaySize = (width, height) => {
  if (!width || !height) {
    return { width: PREVIEW_MAX_WIDTH, height: Math.min(PREVIEW_MAX_HEIGHT, 300) };
  }

  const widthRatio = PREVIEW_MAX_WIDTH / width;
  const heightRatio = PREVIEW_MAX_HEIGHT / height;
  const scale = Math.min(widthRatio, heightRatio, 1);

  return {
    width: Math.max(180, Math.round(width * scale)),
    height: Math.max(180, Math.round(height * scale)),
  };
};

const formatFileSize = (value) => {
  const size = Number(value || 0);
  if (!size) return 'Unknown size';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
};

const getBaseName = (name = 'image') => String(name || 'image').replace(/\.[^.]+$/, '') || 'image';
const getExtensionFromMime = (mimeType = 'image/jpeg') => (mimeType === 'image/png' ? 'png' : 'jpg');
const getOutputMimeType = (mimeType = '') =>
  String(mimeType || '').toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';

const pickDocumentUrl = (media = {}) =>
  String(
    media?.mediaUrl ||
      media?.previewUrl ||
      media?.fileUrl ||
      media?.content?.fileUrl ||
      media?.content?.mediaUrl ||
      media?.content?.url ||
      ''
  ).trim();

const sharedContactFromMedia = (media = {}) => media?.sharedContact || media?.content?.sharedContact || null;

const createDefaultCropRect = (width, height) => {
  const horizontalInset = Math.max(20, Math.round(width * 0.08));
  const verticalInset = Math.max(20, Math.round(height * 0.08));

  return {
    x: horizontalInset,
    y: verticalInset,
    width: Math.max(MIN_CROP_SIZE, width - horizontalInset * 2),
    height: Math.max(MIN_CROP_SIZE, height - verticalInset * 2),
  };
};

const clampCropRectToBounds = (rect, boundsWidth, boundsHeight) => {
  const width = clamp(rect.width, MIN_CROP_SIZE, boundsWidth);
  const height = clamp(rect.height, MIN_CROP_SIZE, boundsHeight);
  const x = clamp(rect.x, 0, Math.max(0, boundsWidth - width));
  const y = clamp(rect.y, 0, Math.max(0, boundsHeight - height));

  return { x, y, width, height };
};

const ToolButton = ({ active = false, label, onClick, children }) => (
  <button
    type="button"
    onClick={(event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick?.(event);
    }}
    className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-semibold transition-colors ${
      active
        ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white shadow-[0_8px_18px_rgba(29,78,216,0.24)]'
        : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]'
    }`}
  >
    {children}
    <span>{label}</span>
  </button>
);

export default function ChatMediaPreviewDialog({ media, onClose, onSend }) {
  const [caption, setCaption] = useState('');
  const [workingMedia, setWorkingMedia] = useState(media);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [activeTool, setActiveTool] = useState('');
  const [paintColor, setPaintColor] = useState('#FFFFFF');
  const [paintStrokes, setPaintStrokes] = useState([]);
  const [draftStroke, setDraftStroke] = useState(null);
  const [textValue, setTextValue] = useState('');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textPosition, setTextPosition] = useState(null);
  const [cropRect, setCropRect] = useState(null);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);
  const paintCanvasRef = useRef(null);
  const cropSurfaceRef = useRef(null);
  const generatedUrlsRef = useRef([]);
  const cropInteractionRef = useRef(null);

  const sharedContact = sharedContactFromMedia(workingMedia);
  const isImage = String(workingMedia?.type || '').trim().toLowerCase() === 'image';
  const isVideo = String(workingMedia?.type || '').trim().toLowerCase() === 'video';
  const isDocument = String(workingMedia?.type || '').trim().toLowerCase() === 'file';
  const displaySize = getDisplaySize(imageSize.width, imageSize.height);

  useEffect(() => {
    setCaption('');
    setWorkingMedia(media);
    setImageSize({ width: 0, height: 0 });
    setActiveTool('');
    setPaintStrokes([]);
    setDraftStroke(null);
    setTextValue('');
    setTextColor('#FFFFFF');
    setTextPosition(null);
    setCropRect(null);
  }, [media]);

  useEffect(() => {
    return () => {
      generatedUrlsRef.current.forEach((url) => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
      generatedUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isImage || !workingMedia?.previewUrl) {
      setImageSize({ width: 0, height: 0 });
      return;
    }

    let isMounted = true;

    loadImage(workingMedia.previewUrl)
      .then((image) => {
        if (!isMounted) return;
        setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      })
      .catch(() => {
        if (!isMounted) return;
        setImageSize({ width: 0, height: 0 });
      });

    return () => {
      isMounted = false;
    };
  }, [isImage, workingMedia?.previewUrl]);

  useEffect(() => {
    if (activeTool !== 'crop' || !isImage || !displaySize.width || !displaySize.height) {
      cropInteractionRef.current = null;
      if (activeTool !== 'crop') {
        setCropRect(null);
      }
      return;
    }

    setCropRect(createDefaultCropRect(displaySize.width, displaySize.height));
  }, [activeTool, displaySize.height, displaySize.width, isImage, workingMedia?.previewUrl]);

  useEffect(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas || activeTool !== 'paint' || !isImage) {
      return;
    }

    canvas.width = displaySize.width;
    canvas.height = displaySize.height;

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    const strokesToRender = draftStroke ? [...paintStrokes, draftStroke] : paintStrokes;
    strokesToRender.forEach((stroke) => {
      if (!stroke?.points?.length) return;
      context.beginPath();
      context.strokeStyle = stroke.color;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = stroke.size;
      stroke.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
          return;
        }
        context.lineTo(point.x, point.y);
      });
      context.stroke();
    });
  }, [activeTool, displaySize.height, displaySize.width, draftStroke, isImage, paintStrokes]);

  useEffect(() => {
    if (activeTool !== 'crop') {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const interaction = cropInteractionRef.current;
      if (!interaction) return;

      const deltaX = event.clientX - interaction.startX;
      const deltaY = event.clientY - interaction.startY;

      setCropRect((currentRect) => {
        const baseRect = interaction.startRect || currentRect;
        if (!baseRect) {
          return currentRect;
        }

        const boundsWidth = displaySize.width;
        const boundsHeight = displaySize.height;
        let nextRect = { ...baseRect };

        if (interaction.mode === 'move') {
          nextRect.x = baseRect.x + deltaX;
          nextRect.y = baseRect.y + deltaY;
          return clampCropRectToBounds(nextRect, boundsWidth, boundsHeight);
        }

        const left = baseRect.x;
        const top = baseRect.y;
        const right = baseRect.x + baseRect.width;
        const bottom = baseRect.y + baseRect.height;

        if (interaction.mode === 'nw') {
          const nextLeft = clamp(left + deltaX, 0, right - MIN_CROP_SIZE);
          const nextTop = clamp(top + deltaY, 0, bottom - MIN_CROP_SIZE);
          nextRect = {
            x: nextLeft,
            y: nextTop,
            width: right - nextLeft,
            height: bottom - nextTop,
          };
        }

        if (interaction.mode === 'ne') {
          const nextRight = clamp(right + deltaX, left + MIN_CROP_SIZE, boundsWidth);
          const nextTop = clamp(top + deltaY, 0, bottom - MIN_CROP_SIZE);
          nextRect = {
            x: left,
            y: nextTop,
            width: nextRight - left,
            height: bottom - nextTop,
          };
        }

        if (interaction.mode === 'sw') {
          const nextLeft = clamp(left + deltaX, 0, right - MIN_CROP_SIZE);
          const nextBottom = clamp(bottom + deltaY, top + MIN_CROP_SIZE, boundsHeight);
          nextRect = {
            x: nextLeft,
            y: top,
            width: right - nextLeft,
            height: nextBottom - top,
          };
        }

        if (interaction.mode === 'se') {
          const nextRight = clamp(right + deltaX, left + MIN_CROP_SIZE, boundsWidth);
          const nextBottom = clamp(bottom + deltaY, top + MIN_CROP_SIZE, boundsHeight);
          nextRect = {
            x: left,
            y: top,
            width: nextRight - left,
            height: nextBottom - top,
          };
        }

        return clampCropRectToBounds(nextRect, boundsWidth, boundsHeight);
      });
    };

    const handlePointerUp = () => {
      cropInteractionRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeTool, displaySize.height, displaySize.width]);

  if (!media || !workingMedia) {
    return null;
  }

  const registerGeneratedUrl = (url) => {
    if (!url || !url.startsWith('blob:')) {
      return;
    }

    generatedUrlsRef.current.push(url);
    if (generatedUrlsRef.current.length > 6) {
      const retiredUrl = generatedUrlsRef.current.shift();
      if (retiredUrl && retiredUrl !== workingMedia.previewUrl) {
        URL.revokeObjectURL(retiredUrl);
      }
    }
  };

  const preserveGeneratedUrl = (url) => {
    generatedUrlsRef.current = generatedUrlsRef.current.filter((currentUrl) => currentUrl !== url);
  };

  const applyCanvasResult = async (canvas, nameSuffix = 'edited') => {
    const outputType = getOutputMimeType(workingMedia.mimeType || workingMedia.file?.type || 'image/jpeg');
    const blob = await canvasToBlob(canvas, outputType);
    const extension = getExtensionFromMime(outputType);
    const nextFile = new File(
      [blob],
      `${getBaseName(workingMedia.name || workingMedia.file?.name || 'image')}-${nameSuffix}.${extension}`,
      { type: outputType }
    );
    const nextUrl = URL.createObjectURL(nextFile);
    registerGeneratedUrl(nextUrl);
    setWorkingMedia((currentMedia) => ({
      ...currentMedia,
      file: nextFile,
      previewUrl: nextUrl,
      mediaUrl: nextUrl,
      mimeType: outputType,
      name: nextFile.name,
      size: nextFile.size,
    }));
  };

  const resetToolState = () => {
    setActiveTool('');
    setPaintStrokes([]);
    setDraftStroke(null);
    setTextValue('');
    setTextPosition(null);
  };

  const handleRotate = async () => {
    if (!isImage || isApplyingEdit) {
      return;
    }

    setIsApplyingEdit(true);
    try {
      const image = await loadImage(workingMedia.previewUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalHeight;
      canvas.height = image.naturalWidth;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to rotate the selected image.');
      }

      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(Math.PI / 2);
      context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      await applyCanvasResult(canvas, 'rotated');
      resetToolState();
    } finally {
      setIsApplyingEdit(false);
    }
  };

  const handleApplyCrop = async () => {
    if (!isImage || !cropRect || !displaySize.width || !displaySize.height || isApplyingEdit) {
      return;
    }

    setIsApplyingEdit(true);
    try {
      const image = await loadImage(workingMedia.previewUrl);
      const scaleX = image.naturalWidth / displaySize.width;
      const scaleY = image.naturalHeight / displaySize.height;
      const sourceX = cropRect.x * scaleX;
      const sourceY = cropRect.y * scaleY;
      const sourceWidth = cropRect.width * scaleX;
      const sourceHeight = cropRect.height * scaleY;
      const outputScale =
        sourceWidth > CROP_OUTPUT_MAX_WIDTH ? CROP_OUTPUT_MAX_WIDTH / sourceWidth : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
      canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to crop the selected image.');
      }

      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      await applyCanvasResult(canvas, 'cropped');
      resetToolState();
    } finally {
      setIsApplyingEdit(false);
    }
  };

  const handleApplyPaint = async () => {
    if (!isImage || !paintStrokes.length || isApplyingEdit) {
      return;
    }

    setIsApplyingEdit(true);
    try {
      const image = await loadImage(workingMedia.previewUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to paint on the selected image.');
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const scaleX = canvas.width / displaySize.width;
      const scaleY = canvas.height / displaySize.height;

      paintStrokes.forEach((stroke) => {
        if (!stroke?.points?.length) return;
        context.beginPath();
        context.strokeStyle = stroke.color;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = stroke.size * scaleX;
        stroke.points.forEach((point, index) => {
          const nextX = point.x * scaleX;
          const nextY = point.y * scaleY;
          if (index === 0) {
            context.moveTo(nextX, nextY);
            return;
          }
          context.lineTo(nextX, nextY);
        });
        context.stroke();
      });

      await applyCanvasResult(canvas, 'painted');
      resetToolState();
    } finally {
      setIsApplyingEdit(false);
    }
  };

  const handleApplyText = async () => {
    if (!isImage || !textValue.trim() || isApplyingEdit) {
      return;
    }

    setIsApplyingEdit(true);
    try {
      const image = await loadImage(workingMedia.previewUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to add text to the selected image.');
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const position = textPosition || { x: 0.5, y: 0.84 };
      const fontSize = Math.max(Math.round(canvas.width * 0.06), 32);
      context.font = `700 ${fontSize}px Arial, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = Math.max(4, Math.round(fontSize * 0.12));
      context.strokeStyle = 'rgba(15, 23, 42, 0.55)';
      context.fillStyle = textColor;
      context.strokeText(textValue.trim(), position.x * canvas.width, position.y * canvas.height);
      context.fillText(textValue.trim(), position.x * canvas.width, position.y * canvas.height);

      await applyCanvasResult(canvas, 'text');
      resetToolState();
    } finally {
      setIsApplyingEdit(false);
    }
  };

  const getPointerPoint = (event) => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    };
  };

  const handlePaintPointerDown = (event) => {
    if (activeTool !== 'paint') {
      return;
    }

    const point = getPointerPoint(event);
    if (!point) return;
    event.preventDefault();
    setDraftStroke({
      color: paintColor,
      size: 5,
      points: [point],
    });
  };

  const handlePaintPointerMove = (event) => {
    if (activeTool !== 'paint' || !draftStroke) {
      return;
    }

    const point = getPointerPoint(event);
    if (!point) return;
    event.preventDefault();
    setDraftStroke((currentStroke) =>
      currentStroke
        ? {
            ...currentStroke,
            points: [...currentStroke.points, point],
          }
        : currentStroke
    );
  };

  const handlePaintPointerUp = () => {
    if (!draftStroke) {
      return;
    }

    setPaintStrokes((currentStrokes) => [...currentStrokes, draftStroke]);
    setDraftStroke(null);
  };

  const handleToolToggle = (tool) => {
    if (!isImage || isApplyingEdit) {
      return;
    }

    setActiveTool((currentTool) => (currentTool === tool ? '' : tool));
    setPaintStrokes([]);
    setDraftStroke(null);
    if (tool !== 'crop') {
      setCropRect(null);
    }
    if (tool !== 'text') {
      setTextValue('');
      setTextPosition(null);
    }
  };

  const handleTextPlacement = (event) => {
    if (activeTool !== 'text') {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const nextX = clamp((event.clientX - bounds.left) / bounds.width, 0.08, 0.92);
    const nextY = clamp((event.clientY - bounds.top) / bounds.height, 0.1, 0.9);
    setTextPosition({ x: nextX, y: nextY });
  };

  const getCropSurfacePoint = (event) => {
    const surface = cropSurfaceRef.current;
    if (!surface) return null;

    const rect = surface.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    };
  };

  const handleCropInteractionStart = (mode) => (event) => {
    if (!cropRect) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = getCropSurfacePoint(event);
    if (!point) {
      return;
    }

    cropInteractionRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRect: cropRect,
    };
  };

  const handleSubmit = () => {
    preserveGeneratedUrl(workingMedia.previewUrl);
    onSend?.(workingMedia, caption);
  };

  const documentUrl = pickDocumentUrl(workingMedia);
  const colorChoices = ['#FFFFFF', '#F8FAFC', '#38BDF8', '#F472B6', '#FACC15', '#22C55E'];

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative flex max-h-[92vh] w-full max-w-[620px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_18px_60px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-[64px] items-center justify-between border-b border-[#E5EAF2] px-5 sm:px-6">
          <div>
            <h3 className="text-[18px] font-bold text-[#0F172A]">Send {workingMedia.kind}</h3>
            <p className="mt-0.5 text-[12px] text-[#64748B]">
              {isImage ? 'Edit before sending if you want.' : 'Preview before you send it.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#64748B]"
            aria-label="Cancel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>

        {isImage ? (
          <div className="border-b border-[#E5EAF2] bg-[#FBFCFE] px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <ToolButton active={activeTool === 'crop'} label="Crop" onClick={() => handleToolToggle('crop')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 3.75v10.5A3.75 3.75 0 0 0 9.75 18H20.25"></path>
                  <path d="M18 20.25V9.75A3.75 3.75 0 0 0 14.25 6H3.75"></path>
                </svg>
              </ToolButton>
              <ToolButton active={false} label="Rotate" onClick={handleRotate}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3.75 10a8.25 8.25 0 1 1 2.42 5.83"></path>
                  <path d="m3.75 4.75.25 5.25 5.25-.25"></path>
                </svg>
              </ToolButton>
              <ToolButton active={activeTool === 'paint'} label="Paint" onClick={() => handleToolToggle('paint')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="m14.5 4.5 5 5"></path>
                  <path d="M3.75 20.25 9 19l9.5-9.5a1.77 1.77 0 0 0 0-2.5l-1.5-1.5a1.77 1.77 0 0 0-2.5 0L5 15l-1.25 5.25Z"></path>
                </svg>
              </ToolButton>
              <ToolButton active={activeTool === 'text'} label="Text" onClick={() => handleToolToggle('text')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 6.5h14"></path>
                  <path d="M12 6.5v11"></path>
                  <path d="M8.5 17.5h7"></path>
                </svg>
              </ToolButton>
            </div>

            {activeTool === 'crop' ? (
              <div
                className="mt-3 rounded-[18px] border border-[#E2E8F0] bg-white px-4 py-3"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[13px] font-semibold text-[#334155]">Manual crop</p>
                    <p className="mt-1 text-[12px] text-[#64748B]">
                      Drag the box or pull the corners to crop the photo.
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetToolState}
                      className="rounded-full border border-[#E2E8F0] px-4 py-2 text-[13px] font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC]"
                    >
                      Cancel crop
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCrop}
                      disabled={!cropRect || isApplyingEdit}
                      className="rounded-full bg-[#7C3AED] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#6D28D9] disabled:cursor-not-allowed disabled:bg-[#C4B5FD]"
                    >
                      Apply crop
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTool === 'paint' ? (
              <div
                className="mt-3 flex flex-wrap items-center gap-2 rounded-[18px] border border-[#E2E8F0] bg-white px-4 py-3"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {colorChoices.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setPaintColor(color)}
                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 ${
                      paintColor === color ? 'border-[#7C3AED]' : 'border-white'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Select ${color} paint color`}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPaintStrokes([]);
                    setDraftStroke(null);
                  }}
                  className="ml-auto rounded-full border border-[#E2E8F0] px-4 py-2 text-[13px] font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC]"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleApplyPaint}
                  disabled={!paintStrokes.length || isApplyingEdit}
                  className="rounded-full bg-[#7C3AED] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#6D28D9] disabled:cursor-not-allowed disabled:bg-[#C4B5FD]"
                >
                  Apply paint
                </button>
              </div>
            ) : null}

            {activeTool === 'text' ? (
              <div
                className="mt-3 rounded-[18px] border border-[#E2E8F0] bg-white px-4 py-3"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={textValue}
                    onChange={(event) => setTextValue(event.target.value)}
                    placeholder="Type text and tap on the image to place it"
                    className="h-11 flex-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[14px] text-[#475569] outline-none placeholder:text-[#94A3B8] focus:border-[#D8B4FE] focus:bg-white"
                  />
                  <div className="flex items-center gap-2">
                    {colorChoices.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setTextColor(color)}
                        className={`h-8 w-8 rounded-full border-2 ${
                          textColor === color ? 'border-[#7C3AED]' : 'border-white'
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select ${color} text color`}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTextValue('');
                      setTextPosition(null);
                      setActiveTool('');
                    }}
                    className="rounded-full border border-[#E2E8F0] px-4 py-2 text-[13px] font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC]"
                  >
                    Cancel text
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyText}
                    disabled={!textValue.trim() || isApplyingEdit}
                    className="rounded-full bg-[#7C3AED] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#6D28D9] disabled:cursor-not-allowed disabled:bg-[#C4B5FD]"
                  >
                    Apply text
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-1 items-center justify-center bg-white px-4 py-5 sm:px-6">
          {isImage && activeTool === 'crop' ? (
            <div className="flex w-full flex-col items-center justify-center">
              <p className="mb-4 text-center text-[13px] text-[#64748B]">
                Adjust the crop box directly on the photo.
              </p>
              <div className="flex w-full items-center justify-center rounded-[28px] border border-[#E5EAF2] bg-[#F8FAFC] px-4 py-5">
                <div
                  ref={cropSurfaceRef}
                  className="relative overflow-hidden rounded-[22px] shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
                  style={{ width: `${displaySize.width}px`, height: `${displaySize.height}px`, touchAction: 'none' }}
                >
                  <img
                    src={workingMedia.previewUrl}
                    alt="Crop preview"
                    draggable={false}
                    className="h-full w-full select-none object-cover"
                  />

                  {cropRect ? (
                    <div
                      className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.42)]"
                      style={{
                        left: `${cropRect.x}px`,
                        top: `${cropRect.y}px`,
                        width: `${cropRect.width}px`,
                        height: `${cropRect.height}px`,
                        cursor: 'move',
                      }}
                      onPointerDown={handleCropInteractionStart('move')}
                    >
                      {[
                        { key: 'nw', cursor: 'nwse-resize', className: '-left-2.5 -top-2.5' },
                        { key: 'ne', cursor: 'nesw-resize', className: '-right-2.5 -top-2.5' },
                        { key: 'sw', cursor: 'nesw-resize', className: '-bottom-2.5 -left-2.5' },
                        { key: 'se', cursor: 'nwse-resize', className: '-bottom-2.5 -right-2.5' },
                      ].map((handle) => (
                        <button
                          key={handle.key}
                          type="button"
                          className={`absolute h-5 w-5 rounded-full border-2 border-white bg-[#7C3AED] shadow-sm ${handle.className}`}
                          style={{ cursor: handle.cursor }}
                          onPointerDown={handleCropInteractionStart(handle.key)}
                          aria-label={`Resize crop ${handle.key}`}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : isImage ? (
            <div
              className="relative flex items-center justify-center"
              style={{ width: `${displaySize.width}px`, height: `${displaySize.height}px` }}
              onClick={handleTextPlacement}
            >
              <img
                src={workingMedia.previewUrl}
                alt="Preview"
                className="h-full w-full rounded-[18px] object-cover shadow-[0_18px_42px_rgba(15,23,42,0.32)]"
              />
              {activeTool === 'paint' ? (
                <canvas
                  ref={paintCanvasRef}
                  className="absolute inset-0 h-full w-full rounded-[18px]"
                  style={{ touchAction: 'none' }}
                  onPointerDown={handlePaintPointerDown}
                  onPointerMove={handlePaintPointerMove}
                  onPointerUp={handlePaintPointerUp}
                  onPointerLeave={handlePaintPointerUp}
                />
              ) : null}
              {activeTool === 'text' && textValue.trim() ? (
                <div
                  className="pointer-events-none absolute select-none px-3 text-center text-[28px] font-bold leading-none"
                  style={{
                    color: textColor,
                    left: `${(textPosition?.x || 0.5) * 100}%`,
                    top: `${(textPosition?.y || 0.84) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    textShadow: '0 2px 10px rgba(15,23,42,0.55)',
                  }}
                >
                  {textValue.trim()}
                </div>
              ) : null}
            </div>
          ) : isVideo ? (
            <video
              src={workingMedia.previewUrl}
              controls
              className="max-h-[420px] max-w-full rounded-[18px] shadow-[0_18px_42px_rgba(15,23,42,0.32)]"
            />
          ) : isDocument ? (
            <div className="w-full max-w-[420px] rounded-[24px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.18)]">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[18px] bg-[#DBEAFE] text-[#2563EB]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M8 3.75h6.4L19 8.35V19a1.75 1.75 0 0 1-1.75 1.75H8A1.75 1.75 0 0 1 6.25 19V5.5A1.75 1.75 0 0 1 8 3.75Z"></path>
                    <path d="M14.25 3.9v3.3c0 .64.51 1.15 1.15 1.15h3.28"></path>
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-bold text-[#0F172A]">
                    {workingMedia.fileName || workingMedia.name || 'Document'}
                  </div>
                  <div className="mt-1 text-[13px] text-[#64748B]">
                    {formatFileSize(workingMedia.fileSize || workingMedia.size)} {workingMedia.mimeType ? `• ${workingMedia.mimeType}` : ''}
                  </div>
                  {documentUrl ? (
                    <a
                      href={documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex rounded-full bg-[#EFF6FF] px-4 py-2 text-[13px] font-semibold text-[#2563EB] transition-colors hover:bg-[#DBEAFE]"
                    >
                      Open document
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : sharedContact ? (
            <div className="w-full max-w-[400px] rounded-[24px] bg-white p-5 shadow-[0_18px_42px_rgba(15,23,42,0.18)]">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F3E8FF] font-bold text-[#7C3AED]">
                  {sharedContact.profilePic ? (
                    <img src={sharedContact.profilePic} alt={sharedContact.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[22px]">{sharedContact.initials || sharedContact.name?.charAt(0) || '?'}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[18px] font-bold text-[#0F172A]">{sharedContact.name}</div>
                  <div className="mt-1 text-[14px] text-[#64748B]">{sharedContact.phone || 'No phone number'}</div>
                  <div className="mt-3 inline-flex rounded-full bg-[#F8FAFC] px-3 py-1 text-[12px] font-semibold text-[#64748B]">
                    Shared contact
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-[#E5EAF2] bg-white px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[44px] flex-shrink-0 items-center justify-center rounded-full border border-[#D6DEE8] bg-white px-5 text-[14px] font-medium text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#475569]"
          >
            Cancel
          </button>
          <input
            type="text"
            placeholder={sharedContact ? 'Add a note...' : 'Add a caption...'}
            className="h-[44px] flex-1 rounded-full border border-[#D6DEE8] bg-[#F8FAFC] px-5 text-[14px] text-[#475569] outline-none placeholder:text-[#94A3B8] focus:border-[#CBD5E1] focus:bg-white"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!workingMedia}
            className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(103.1deg,#8B5CF6_8.19%,#A423E0_106.2%)] text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4.1 18.95 20.4 12 4.1 5.05l2.56 5.56c.18.38.18.81 0 1.19L4.1 18.95Z"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.35 11.98h8.2"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
