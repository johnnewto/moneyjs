import type { CldResult } from "@sfcr/core";

import type { CldWorkerRequest, CldWorkerResponse } from "./cld.worker";

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, { resolve: (result: CldResult) => void; reject: (error: Error) => void }>();

function ensureWorker(): Worker {
  if (worker) {
    return worker;
  }

  const instance = new Worker(new URL("./cld.worker.ts", import.meta.url), {
    type: "module"
  });

  instance.onmessage = (event: MessageEvent<CldWorkerResponse>) => {
    const pendingRequest = pending.get(event.data.id);
    if (!pendingRequest) {
      return;
    }
    pending.delete(event.data.id);
    pendingRequest.resolve(event.data.result);
  };

  instance.onerror = () => {
    rejectAll(new Error("CLD worker failed."));
    worker = null;
  };

  instance.onmessageerror = () => {
    rejectAll(new Error("CLD worker sent an unreadable response."));
    worker = null;
  };

  worker = instance;
  return instance;
}

function rejectAll(error: Error): void {
  for (const pendingRequest of pending.values()) {
    pendingRequest.reject(error);
  }
  pending.clear();
}

export function generateCldInWorker(
  payload: Omit<CldWorkerRequest, "id">
): { id: number; promise: Promise<CldResult> } {
  const id = ++nextRequestId;
  const promise = new Promise<CldResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, ...payload } satisfies CldWorkerRequest);
  });
  return { id, promise };
}

export function cancelCldWorkerRequest(requestId: number): void {
  pending.delete(requestId);
}

export function disposeCldWorker(): void {
  worker?.terminate();
  worker = null;
  rejectAll(new Error("CLD worker was disposed before the request completed."));
}
