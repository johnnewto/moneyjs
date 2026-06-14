import { isPublicationPathname } from "../publication/publicationRouteHelpers";

export const UNSAVED_CHANGES_MESSAGE =
  "You have unsaved changes. Leave this page anyway?";

export function isPublicationNavigationHref(href: string): boolean {
  if (!href || href.startsWith("#")) {
    return false;
  }

  try {
    const url = new URL(href, window.location.href);
    return isPublicationPathname(url.pathname);
  } catch {
    return false;
  }
}

export function confirmUnsavedNavigation(
  isDirty: boolean,
  message: string = UNSAVED_CHANGES_MESSAGE
): boolean {
  if (!isDirty) {
    return true;
  }

  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true;
  }

  return window.confirm(message);
}

export function readAppLocation(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function isInternalNavigationHref(href: string): boolean {
  if (!href || href.startsWith("#")) {
    return true;
  }

  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return false;
  }

  return href.startsWith("/");
}

export function resolveNavigationTarget(href: string): string {
  const url = new URL(href, window.location.href);
  return `${url.pathname}${url.search}${url.hash}`;
}
