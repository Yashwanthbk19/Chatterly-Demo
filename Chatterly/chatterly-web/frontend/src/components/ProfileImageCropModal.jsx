import React, { useEffect, useMemo, useRef, useState } from 'react';

const CROP_SIZE = 280;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.01;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image.'));
    image.src = src;
  });

export default function ProfileImageCropModal({
  isOpen,
  imageSrc,
  imageName,
  imageType,
  onCancel,
  onApply,
  layerClassName = 'z-[120]',
}) {
  const [imageMetrics, setImageMetrics] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isApplying, setIsApplying] = useState(false);
  const dragStateRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !imageSrc) {
      setImageMetrics(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setIsApplying(false);
      dragStateRef.current = null;
      return;
    }

    let isMounted = true;

    loadImage(imageSrc)
      .then((image) => {
        if (!isMounted) return;
        const baseScale = Math.max(CROP_SIZE / image.naturalWidth, CROP_SIZE / image.naturalHeight);
        setImageMetrics({
          width: image.naturalWidth,
          height: image.naturalHeight,
          baseScale,
        });
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      })
      .catch(() => {
        if (!isMounted) return;
        setImageMetrics(null);
      });

    return () => {
      isMounted = false;
    };
  }, [imageSrc, isOpen]);

  const renderScale = useMemo(() => {
    if (!imageMetrics) return 1;
    return imageMetrics.baseScale * zoom;
  }, [imageMetrics, zoom]);

  const renderedSize = useMemo(() => {
    if (!imageMetrics) {
      return { width: CROP_SIZE, height: CROP_SIZE };
    }

    return {
      width: imageMetrics.width * renderScale,
      height: imageMetrics.height * renderScale,
    };
  }, [imageMetrics, renderScale]);

  const clampedOffset = useMemo(() => {
    const maxOffsetX = Math.max(0, (renderedSize.width - CROP_SIZE) / 2);
    const maxOffsetY = Math.max(0, (renderedSize.height - CROP_SIZE) / 2);

    return {
      x: clamp(offset.x, -maxOffsetX, maxOffsetX),
      y: clamp(offset.y, -maxOffsetY, maxOffsetY),
    };
  }, [offset.x, offset.y, renderedSize.height, renderedSize.width]);

  useEffect(() => {
    if (clampedOffset.x !== offset.x || clampedOffset.y !== offset.y) {
      setOffset(clampedOffset);
    }
  }, [clampedOffset, offset.x, offset.y]);

  const updateOffsetFromPointer = (clientX, clientY) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const nextOffset = {
      x: dragState.originOffset.x + (clientX - dragState.startX),
      y: dragState.originOffset.y + (clientY - dragState.startY),
    };

    setOffset(nextOffset);
  };

  const handlePointerDown = (event) => {
    if (!imageMetrics) return;

    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originOffset: clampedOffset,
    };
  };

  useEffect(() => {
    const handlePointerMove = (event) => updateOffsetFromPointer(event.clientX, event.clientY);
    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const handleZoomChange = (event) => {
    const nextZoom = Number(event.target.value);
    setZoom(nextZoom);
  };

  const handleApply = async () => {
    if (!imageSrc || !imageMetrics) return;

    setIsApplying(true);

    try {
      const image = await loadImage(imageSrc);
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to edit the selected image.');
      }

      const imageLeft = CROP_SIZE / 2 - renderedSize.width / 2 + clampedOffset.x;
      const imageTop = CROP_SIZE / 2 - renderedSize.height / 2 + clampedOffset.y;
      const sourceX = clamp((0 - imageLeft) / renderScale, 0, imageMetrics.width);
      const sourceY = clamp((0 - imageTop) / renderScale, 0, imageMetrics.height);
      const sourceWidth = clamp(CROP_SIZE / renderScale, 1, imageMetrics.width - sourceX);
      const sourceHeight = clamp(CROP_SIZE / renderScale, 1, imageMetrics.height - sourceY);

      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      );

      const outputType = imageType === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Unable to edit the selected image.'));
          }
        }, outputType, 0.92);
      });

      const extension = outputType === 'image/png' ? 'png' : 'jpg';
      const safeImageName = (imageName || 'profile-photo').replace(/\.[^.]+$/, '');
      const croppedFile = new File([blob], `${safeImageName}-cropped.${extension}`, {
        type: outputType,
      });
      const croppedPreviewUrl = URL.createObjectURL(croppedFile);

      onApply?.({
        file: croppedFile,
        previewUrl: croppedPreviewUrl,
      });
    } catch (error) {
      onApply?.({
        error: error?.message || 'Unable to edit the selected image.',
      });
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className={`fixed inset-0 ${layerClassName} flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]`}>
      <div className="w-full max-w-[560px] rounded-[28px] bg-white p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-[#212529]">Crop profile photo</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#71767A]">
              Adjust the photo before it is uploaded. Drag to reposition and use the slider to zoom.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close crop editor"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center gap-6">
          <div className="relative flex h-[320px] w-full items-center justify-center rounded-[24px] bg-[#F4F6FB]">
            <div
              className="relative h-[280px] w-[280px] overflow-hidden rounded-full border-4 border-white shadow-lg"
              onPointerDown={handlePointerDown}
              style={{ touchAction: 'none', cursor: imageMetrics ? 'grab' : 'default' }}
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt="Crop preview"
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: `${renderedSize.width}px`,
                    height: `${renderedSize.height}px`,
                    transform: `translate(calc(-50% + ${clampedOffset.x}px), calc(-50% + ${clampedOffset.y}px))`,
                  }}
                />
              ) : null}
            </div>

            <div className="pointer-events-none absolute inset-0 rounded-[24px] border border-dashed border-[#D0D7E6]" />
          </div>

          <div className="w-full">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-[#495057]">
              <span>Zoom</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={zoom}
              onChange={handleZoomChange}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#DCE4FF]"
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-gray-200 px-5 py-3.5 text-sm font-bold text-[#212529] transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!imageMetrics || isApplying}
            className="rounded-2xl bg-[#4C6EF5] px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#3b5bdb] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
          >
            {isApplying ? 'Applying...' : 'Apply crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
