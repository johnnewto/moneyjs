import {
  generateCld,
  type CldNodeKind,
  type CldResult,
  type MatrixColumnSumBindings
} from "@sfcr/core";

export interface CldWorkerRequest {
  id: number;
  equations: Record<string, string>;
  matrixColumnSums?: MatrixColumnSumBindings;
  nodeKinds?: Record<string, CldNodeKind | undefined>;
}

export interface CldWorkerResponse {
  id: number;
  result: CldResult;
}

self.onmessage = (event: MessageEvent<CldWorkerRequest>) => {
  const { id, equations, matrixColumnSums, nodeKinds } = event.data;
  const result = generateCld(equations, { matrixColumnSums, nodeKinds });
  const response: CldWorkerResponse = { id, result };
  self.postMessage(response);
};
