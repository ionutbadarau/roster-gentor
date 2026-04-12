'use client';

import { useEffect, useRef, useCallback } from 'react';
import { SchedulingEngine } from './scheduling-engine';
import type { ScheduleGenerationOptions } from './constants';
import type { ScheduleGenerationResult } from '@/types/scheduling';

export function useSchedulingWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      try {
        workerRef.current = new Worker(
          new URL('./scheduling.worker.ts', import.meta.url)
        );
      } catch {
        workerRef.current = null;
      }
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const generate = useCallback(
    (options: ScheduleGenerationOptions): Promise<ScheduleGenerationResult> => {
      const worker = workerRef.current;
      if (!worker) {
        // Fallback: run on main thread
        const engine = new SchedulingEngine(options);
        return Promise.resolve(engine.generateSchedule());
      }

      return new Promise((resolve, reject) => {
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
