import { notebookToJson } from "../notebook/document";
import {
  NOTEBOOK_SHARE_MAX_COMPRESSED_LENGTH,
  NOTEBOOK_SHARE_QUERY_PARAM,
  compressNotebookSharePayload
} from "../notebook/notebookShareLink";
import type { NotebookDocument } from "../notebook/types";
import { buildPublicationPathname } from "./publicationRouteHelpers";

/**
 * Builds a self-contained publish URL such as `<origin>/publish/live?nbz=...`.
 *
 * The notebook document is compressed into the `nbz` query parameter (the same
 * scheme used by the interactive notebook share link), so the link renders the
 * shared document in any browser without relying on the live `sessionStorage`
 * handoff.
 */
export function buildPublicationShareUrl(args: {
  document: NotebookDocument;
  origin: string;
  cellId?: string | null;
}): { url: string } | { error: string } {
  const source = notebookToJson(args.document);
  const nbz = compressNotebookSharePayload(source);
  if (nbz.length > NOTEBOOK_SHARE_MAX_COMPRESSED_LENGTH) {
    return {
      error: `Notebook is too large to share as a URL (${nbz.length} characters compressed; limit is ${NOTEBOOK_SHARE_MAX_COMPRESSED_LENGTH}). Use Save or Export instead.`
    };
  }

  const origin = args.origin.replace(/\/$/, "");
  const path = buildPublicationPathname({
    mode: "publish",
    source: "live",
    cellId: args.cellId?.trim() || undefined
  });
  const params = new URLSearchParams();
  params.set(NOTEBOOK_SHARE_QUERY_PARAM, nbz);

  return { url: `${origin}${path}?${params.toString()}` };
}
