import { defaultLang } from "../../packages/excalidraw/i18n";
import { UI } from "../../packages/excalidraw/tests/helpers/ui";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "../../packages/excalidraw/tests/test-utils";

import ExcalidrawApp from "../App";

describe("Test LanguageList", () => {
  it("rerenders UI on language change", async () => {
    await render(
      <ExcalidrawApp
        username="test"
        BACKEND_V2_POST="https://json.excalidraw.com/api/v2/post/"
        BACKEND_V2_GET="https://json.excalidraw.com/api/v2/"
        HTTP_STORAGE_BACKEND_URL="https://json.excalidraw.com/api/storage/v2/"
      />,
    );

    // select rectangle tool to show properties menu
    UI.clickTool("rectangle");
    // english lang should display `thin` label
    expect(screen.queryByTitle(/thin/i)).not.toBeNull();
    fireEvent.click(document.querySelector(".dropdown-menu-button")!);

    fireEvent.change(document.querySelector(".dropdown-select__language")!, {
      target: { value: "de-DE" },
    });
    // switching to german, `thin` label should no longer exist
    await waitFor(() => expect(screen.queryByTitle(/thin/i)).toBeNull());
    // reset language
    fireEvent.change(document.querySelector(".dropdown-select__language")!, {
      target: { value: defaultLang.code },
    });
    // switching back to English
    await waitFor(() => expect(screen.queryByTitle(/thin/i)).not.toBeNull());
  });
});
