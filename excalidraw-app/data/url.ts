const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:"]);
const RELATIVE_LINK_BASE_URL = "https://relative-link.invalid";

export const getValidatedLink = (link: string): string | null => {
  if (!link.trim()) {
    return null;
  }

  try {
    const url = new URL(link, RELATIVE_LINK_BASE_URL);
    return ALLOWED_LINK_PROTOCOLS.has(url.protocol) ? link : null;
  } catch {
    return null;
  }
};

export const getValidatedExternalSceneUrl = (
  encodedUrl: string,
): string | null => {
  try {
    const decodedUrl = window.decodeURIComponent(encodedUrl);
    if (!decodedUrl.trim()) {
      return null;
    }

    const url = new URL(decodedUrl, window.location.href);
    return ALLOWED_LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export const preventInvalidLinkOpen = (
  link: string | null,
  event: Pick<Event, "preventDefault">,
): boolean => {
  if (link && getValidatedLink(link)) {
    return false;
  }

  event.preventDefault();
  return true;
};
