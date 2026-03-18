'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { ScheduleGenerationOptions } from './constants';
import type { ScheduleGenerationResult } from '@/types/scheduling';

export function useSchedulingWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      workerRef.current = new Worker(
        new URL('./scheduling.worker.ts', import.meta.url)
      );
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const generate = useCallback(
    (options: ScheduleGenerationOptions): Promise<ScheduleGenerationResult> => {
      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error('Worker not available'));
          return;
        }

        worker.onmessage = (e: MessageEvent<ScheduleGenerationResult>) => {
          resolve(e.data);
        };

        worker.onerror = (e) => {
          reject(new Error(e.message));
        };

        worker.postMessage(options);
      });
    },
    []
  );

  return { generate };
}
