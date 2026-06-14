// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createNotebookFromTemplate } from "../src/notebook/templates";
import {
  PUBLICATION_LIVE_SESSION_STORAGE_KEY,
  readPublicationLiveReturnUrl,
  readPublicationLiveSession,
  subscribePublicationLiveSession,
  writePublicationLiveSession
} from "../src/publication/publicationLiveSession";

describe("publicationLiveSession", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("writes and reads a live publication snapshot", () => {
    const document = createNotebookFromTemplate("bmw");
    document.cells[0] =
      document.cells[0]?.type === "markdown"
        ? { ...document.cells[0], title: "Edited overview" }
        : document.cells[0]!;

    writePublicationLiveSession({
      document,
      returnUrl: "/notebook/bmw/intro"
    });

    const snapshot = readPublicationLiveSession();
    expect(snapshot?.document.cells[0]?.title).toBe("Edited overview");
    expect(snapshot?.returnUrl).toBe("/notebook/bmw/intro");
    expect(snapshot?.revision).toBe(1);
    expect(readPublicationLiveReturnUrl()).toBe("/notebook/bmw/intro");
  });

  it("notifies subscribers when the live snapshot changes in another tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePublicationLiveSession(listener);

    writePublicationLiveSession({
      document: createNotebookFromTemplate("bmw"),
      returnUrl: "/notebook/bmw"
    });

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: PUBLICATION_LIVE_SESSION_STORAGE_KEY,
        newValue: window.sessionStorage.getItem(PUBLICATION_LIVE_SESSION_STORAGE_KEY)
      })
    );

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
