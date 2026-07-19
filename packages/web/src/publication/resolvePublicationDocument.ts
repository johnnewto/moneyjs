import {
  createNotebookFromTemplate,
  DEFAULT_NOTEBOOK_TEMPLATE_ID,
  isNotebookTemplateId,
  type NotebookTemplateId
} from "../notebook/templates";
import { tryLoadNotebookFromShareLocation } from "../notebook/notebookShareLink";
import type { NotebookDocument } from "../notebook/types";
import {
  readPublicationLiveSession,
  subscribePublicationLiveSession
} from "./publicationLiveSession";
import type { PublicationRouteLocation } from "./publicationRouteHelpers";

export function resolvePublicationTemplateId(document: NotebookDocument): NotebookTemplateId {
  const templateId = document.metadata.template;
  if (templateId && isNotebookTemplateId(templateId)) {
    return templateId;
  }

  return DEFAULT_NOTEBOOK_TEMPLATE_ID;
}

export function resolveInitialPublicationDocument(route: PublicationRouteLocation): {
  document: NotebookDocument;
  liveSessionMissing: boolean;
} {
  if (route.source === "live") {
    // A shared publish link carries the document in `nbz` (hash preferred;
    // legacy query still supported), so it renders without sessionStorage.
    const sharedDocument =
      typeof window === "undefined" ? null : tryLoadNotebookFromShareLocation();
    if (sharedDocument) {
      return { document: sharedDocument, liveSessionMissing: false };
    }

    const session = readPublicationLiveSession();
    if (session) {
      return { document: session.document, liveSessionMissing: false };
    }

    return {
      document: createNotebookFromTemplate(DEFAULT_NOTEBOOK_TEMPLATE_ID),
      liveSessionMissing: true
    };
  }

  return {
    document: createNotebookFromTemplate(route.templateId ?? DEFAULT_NOTEBOOK_TEMPLATE_ID),
    liveSessionMissing: false
  };
}

export function subscribeLivePublicationDocument(
  listener: (document: NotebookDocument) => void
): () => void {
  return subscribePublicationLiveSession((snapshot) => {
    listener(snapshot.document);
  });
}
