import { handleWorkerRequest } from "./handler";

import type { WorkerRequest } from "./protocol";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  self.postMessage(handleWorkerRequest(event.data));
};
