import { useState, useCallback } from 'react';
import { compressMedia, COMPRESSION_STAGES } from '../utils/mediaCompression';

export const useMediaCompression = (simulationDelay = 2000) => {
  const [stage, setStage] = useState(COMPRESSION_STAGES.PENDING);
  const [compressionStats, setCompressionStats] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState(null);

  const handleStageChange = useCallback((newStage) => {
    setStage(newStage);
  }, []);

  const compress = useCallback(
    async (file) => {
      setIsCompressing(true);
      setError(null);
      setStage(COMPRESSION_STAGES.PENDING);
      setCompressionStats(null);

      const result = await compressMedia(file, handleStageChange, simulationDelay);

      if (result.success) {
        setCompressionStats(result.stats);
        setStage(COMPRESSION_STAGES.COMPLETED);
      } else {
        setError(result.error);
        setStage(COMPRESSION_STAGES.FAILED);
      }

      setIsCompressing(false);
      return result;
    },
    [simulationDelay, handleStageChange]
  );

  const reset = useCallback(() => {
    setStage(COMPRESSION_STAGES.PENDING);
    setCompressionStats(null);
    setIsCompressing(false);
    setError(null);
  }, []);

  const getStageLabel = useCallback(() => {
    const labels = {
      [COMPRESSION_STAGES.PENDING]: 'Ready',
      [COMPRESSION_STAGES.COMPRESSING]: 'Compressing...',
      [COMPRESSION_STAGES.UPLOADING]: 'Uploading...',
      [COMPRESSION_STAGES.COMPLETED]: 'Completed',
      [COMPRESSION_STAGES.FAILED]: 'Failed',
    };
    return labels[stage] || 'Processing';
  }, [stage]);

  const getStageIcon = useCallback(() => {
    if (stage === COMPRESSION_STAGES.COMPRESSING) {
      return '⚙️';
    }
    if (stage === COMPRESSION_STAGES.UPLOADING) {
      return '📤';
    }
    if (stage === COMPRESSION_STAGES.COMPLETED) {
      return '✅';
    }
    if (stage === COMPRESSION_STAGES.FAILED) {
      return '❌';
    }
    return '📄';
  }, [stage]);

  return {
    stage,
    isCompressing,
    error,
    compressionStats,
    compress,
    reset,
    getStageLabel,
    getStageIcon,
    COMPRESSION_STAGES,
  };
};

export default useMediaCompression;
