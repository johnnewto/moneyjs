import { useEffect, useRef } from "react";

import {
  confirmUnsavedNavigation,
  isInternalNavigationHref,
  readAppLocation,
  resolveNavigationTarget,
  UNSAVED_CHANGES_MESSAGE
} from "../lib/unsavedChangesGuard";

export function useUnsavedChangesGuard(options: {
  isDirty: boolean;
  message?: string;
}) {
  const { isDirty, message = UNSAVED_CHANGES_MESSAGE } = options;
  const isDirtyRef = useRef(isDirty);
  const messageRef = useRef(message);
  const committedLocationRef = useRef(
    typeof window !== "undefined" ? readAppLocation() : ""
  );

  isDirtyRef.current = isDirty;
  messageRef.current = message;

  useEffect(() => {
    if (!isDirty) {
      committedLocationRef.current = readAppLocation();
    }
  });

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!anchor || anchor.target === "_blank") {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || !isInternalNavigationHref(href)) {
        return;
      }

      const nextLocation = resolveNavigationTarget(href);
      if (nextLocation === committedLocationRef.current) {
        return;
      }

      if (!confirmUnsavedNavigation(true, messageRef.current)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const onPopState = () => {
      const nextLocation = readAppLocation();
      if (nextLocation === committedLocationRef.current) {
        return;
      }

      if (!confirmUnsavedNavigation(true, messageRef.current)) {
        history.pushState(history.state, "", committedLocationRef.current);
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isDirty]);

  return {
    confirmNavigation: () => confirmUnsavedNavigation(isDirtyRef.current, messageRef.current),
    restoreCommittedLocation: () => {
      history.replaceState(history.state, "", committedLocationRef.current);
    }
  };
}
