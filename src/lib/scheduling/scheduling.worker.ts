import { SchedulingEngine } from './scheduling-engine';
import type { ScheduleGenerationOptions } from './constants';

self.onmessage = (e: MessageEvent<ScheduleGenerationOptions>) => {
  const engine = new SchedulingEngine(e.data);
  const result = engine.generateSchedule();
  postMessage(result);
};
