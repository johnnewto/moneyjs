import { handleWorkerRequest, type WorkerRequest } from "@sfcr/core-worker";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  self.postMessage(handleWorkerRequest(event.data));
};

export {};
