import { useEffect, useRef, useState } from "react";

export function useViewportObserver<T extends Element>({
  disabled = false,
  root = null,
  rootMargin = "20px 0px",
  threshold = 0
}: {
  disabled?: boolean;
  root?: Element | Document | null;
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

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(entry?.isIntersecting ?? false);
      },
      {
        root,
        rootMargin,
        threshold
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [disabled, root, rootMargin, threshold]);

  return {
    isInViewport,
    targetRef
  };
}