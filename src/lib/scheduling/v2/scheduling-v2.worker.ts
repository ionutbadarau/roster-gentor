import { SchedulingEngineV2 } from './scheduling-engine-v2';
import type { ScheduleGenerationOptions } from '../constants';

self.onmessage = (e: MessageEvent<ScheduleGenerationOptions>) => {
  const engine = new SchedulingEngineV2(e.data);
  const result = engine.generateSchedule();
  postMessage(result);
};
