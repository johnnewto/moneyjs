import { notebookToJson } from "../notebook/document";
import {
  NOTEBOOK_SHARE_MAX_COMPRESSED_LENGTH,
  NOTEBOOK_SHARE_QUERY_PARAM,
  compressNotebookSharePayload
} from "../notebook/notebookShareLink";
import type { NotebookDocument } from "../notebook/types";
import { buildPublicationPathname } from "./publicationRouteHelpers";

/**
 * Builds a self-contained publish URL such as `<origin>/publish/live#?nbz=...`.
 *
 * The notebook document is compressed into the `nbz` hash parameter (same
 * payload scheme as the interactive notebook share link). Hash routing keeps
 * `nbz` off the HTTP request line so static hosts like GitHub Pages do not
 * return HTTP 414. Legacy `?nbz=` query links still load when present.
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

  return { url: `${origin}${path}#?${params.toString()}` };
}
