import React from 'react';
import { COMPRESSION_STAGES } from '../utils/mediaCompression';

export default function CompressionIndicator({
  stage = COMPRESSION_STAGES.PENDING,
  stats = null,
  label = 'Processing media',
  isVisible = false,
}) {
  if (!isVisible) {
    return null;
  }

  const stageConfig = {
    [COMPRESSION_STAGES.PENDING]: {
      icon: '📄',
      label: 'Ready',
      color: 'gray',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-100',
      textColor: 'text-gray-900',
      descColor: 'text-gray-700',
      showSpinner: false,
    },
    [COMPRESSION_STAGES.COMPRESSING]: {
      icon: '⚙️',
      label: 'Compressing...',
      color: 'blue',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-100',
      textColor: 'text-blue-900',
      descColor: 'text-blue-700',
      showSpinner: true,
    },
    [COMPRESSION_STAGES.UPLOADING]: {
      icon: '📤',
      label: 'Uploading...',
      color: 'indigo',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-100',
      textColor: 'text-indigo-900',
      descColor: 'text-indigo-700',
      showSpinner: true,
    },
    [COMPRESSION_STAGES.COMPLETED]: {
      icon: '✅',
      label: 'Completed',
      color: 'green',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-100',
      textColor: 'text-green-900',
      descColor: 'text-green-700',
      showSpinner: false,
    },
    [COMPRESSION_STAGES.FAILED]: {
      icon: '❌',
      label: 'Failed',
      color: 'red',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-100',
      textColor: 'text-red-900',
      descColor: 'text-red-700',
      showSpinner: false,
    },
  };

  const config = stageConfig[stage] || stageConfig[COMPRESSION_STAGES.PENDING];

  return (
    <div className={`rounded-2xl border ${config.borderColor} ${config.bgColor} px-5 py-4`}>
      <div className="flex items-center gap-3">
        <span className="text-xl">{config.icon}</span>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${config.textColor}`}>
            {config.label}
          </p>
          {stats && (
            <div className="mt-1 space-y-1">
              {stats.compressionRatio && (
                <p className={`text-xs ${config.descColor}`}>
                  Reduced by {stats.compressionRatio}%
                </p>
              )}
              {stats.compressedSize && (
                <p className={`text-xs ${config.descColor}`}>
                  Size: {(stats.compressedSize / 1024).toFixed(1)}KB
                </p>
              )}
              {stats.width && stats.height && (
                <p className={`text-xs ${config.descColor}`}>
                  Dimensions: {stats.width}x{stats.height}
                </p>
              )}
            </div>
          )}
        </div>
        {config.showSpinner && (
          <div className={`h-5 w-5 animate-spin rounded-full border-2 border-${config.color}-300 border-t-${config.color}-600`} />
        )}
      </div>
    </div>
  );
}
