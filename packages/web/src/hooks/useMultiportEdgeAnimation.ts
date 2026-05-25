import { useCallback, useEffect, useState } from "react";

import { useViewportObserver } from "./useViewportObserver";

const MULTIPORT_EDGE_ANIMATION_MS = 10_000;

function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readDocumentVisible(): boolean {
  if (typeof document === "undefined") {
    return true;
  }

  return document.visibilityState === "visible";
}

export function useMultiportEdgeAnimation({
  interactionEpoch = 0,
  root = null
}: {
  interactionEpoch?: number;
  root?: Element | null;
} = {}) {
  const { isInViewport, targetRef } = useViewportObserver<HTMLDivElement>({
    root,
    rootMargin: "0px",
    threshold: 0
  });
  const [animationUntil, setAnimationUntil] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readPrefersReducedMotion);
  const [isDocumentVisible, setIsDocumentVisible] = useState(readDocumentVisible);
  const [now, setNow] = useState(() => Date.now());

  const bumpAnimation = useCallback(() => {
    if (prefersReducedMotion) {
      return;
    }

    setAnimationUntil(Date.now() + MULTIPORT_EDGE_ANIMATION_MS);
  }, [prefersReducedMotion]);

  const clearAnimation = useCallback(() => {
    setAnimationUntil(0);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReducedMotion(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = readDocumentVisible();
      setIsDocumentVisible(visible);
      if (!visible) {
        clearAnimation();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [clearAnimation]);

  useEffect(() => {
    if (!isInViewport || !isDocumentVisible || prefersReducedMotion) {
      clearAnimation();
      return;
    }

    bumpAnimation();
  }, [bumpAnimation, clearAnimation, isDocumentVisible, isInViewport, prefersReducedMotion]);

  useEffect(() => {
    if (interactionEpoch <= 0) {
      return;
    }

    if (!isInViewport || !isDocumentVisible || prefersReducedMotion) {
      return;
    }

    bumpAnimation();
  }, [
    bumpAnimation,
    interactionEpoch,
    isDocumentVisible,
    isInViewport,
    prefersReducedMotion
  ]);

  useEffect(() => {
    if (animationUntil <= Date.now()) {
      return;
    }

    const delay = animationUntil - Date.now();
    const timeoutId = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timeoutId);
  }, [animationUntil]);

  const shouldAnimateEdges =
    !prefersReducedMotion &&
    isInViewport &&
    isDocumentVisible &&
    animationUntil > now;

  return {
    bumpAnimation,
    shellRef: targetRef,
    shouldAnimateEdges
  };
}
