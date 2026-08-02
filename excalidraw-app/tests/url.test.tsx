import { vi } from "vitest";
import {
  getValidatedExternalSceneUrl,
  getValidatedLink,
  preventInvalidLinkOpen,
} from "../data/url";

describe("external URL validation", () => {
  it.each([
    "https://example.com/scene",
    "http://example.com/scene",
    "/local-scene",
    "#local-element",
    "//example.com/scene",
  ])("allows web URL %s", (url) => {
    expect(getValidatedLink(url)).not.toBeNull();
  });

  it.each([
    // eslint-disable-next-line no-script-url
    "javascript:alert(document.domain)",
    // eslint-disable-next-line no-script-url
    "java\nscript:alert(document.domain)",
    "data:text/html,<script>alert(document.domain)</script>",
    "vbscript:msgbox(document.domain)",
    "file:///etc/passwd",
    "ftp://example.com/scene",
    "blob:https://example.com/id",
    "about:blank",
    "mailto:test@example.com",
    "http://[invalid",
  ])("blocks unsupported or malformed URL %s", (url) => {
    expect(getValidatedLink(url)).toBeNull();
  });

  it("decodes and validates an external scene URL before fetching it", () => {
    expect(
      getValidatedExternalSceneUrl(
        encodeURIComponent("https://example.com/scene.excalidraw"),
      ),
    ).toBe("https://example.com/scene.excalidraw");

    expect(
      getValidatedExternalSceneUrl(
        // eslint-disable-next-line no-script-url
        encodeURIComponent("javascript:alert(document.domain)"),
      ),
    ).toBeNull();
    expect(getValidatedExternalSceneUrl("%E0%A4%A")).toBeNull();
  });

  it("prevents navigation for a blocked canvas link", () => {
    const preventDefault = vi.fn();

    expect(preventInvalidLinkOpen("about:blank", { preventDefault })).toBe(
      true,
    );
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("keeps navigation enabled for an HTTPS canvas link", () => {
    const preventDefault = vi.fn();

    expect(
      preventInvalidLinkOpen("https://example.com", { preventDefault }),
    ).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
