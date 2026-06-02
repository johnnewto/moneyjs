import type { DetectLoopsOptions } from "./types";

/** Default caps for browser CLD views on large macro models. */
export const DEFAULT_CLD_LOOP_LIMITS: Required<DetectLoopsOptions> = {
  maxLoops: 200,
  maxLoopLength: 24,
  timeoutMs: 2500
};
