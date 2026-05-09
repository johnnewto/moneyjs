import { useEffect, useRef, useState } from "react";

export function useViewportObserver<T extends Element>({
  disabled = false,
  rootMargin = "20px 0px",
  threshold = 0
}: {
  disabled?: boolean;
  rootMargin?: string;
  threshold?: number;
} = {}) {
  const targetRef = useRef<T | null>(null);
  const [isInViewport, setIsInViewport] = useState(disabled);

  useEffect(() => {
    if (disabled) {
      setIsInViewport(true);
      return;
    }

    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setIsInViewport(true);
      return;
    }

    setIsInViewport(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(entry?.isIntersecting ?? false);
      },
      {
        root: null,
        rootMargin,
        threshold
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [disabled, rootMargin, threshold]);

  return {
    isInViewport,
    targetRef
  };
}