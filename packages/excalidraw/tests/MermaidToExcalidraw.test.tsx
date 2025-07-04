import { cleanup } from "./helpers/cleanup";
import { act, render, waitFor } from "./test-utils";
import { Excalidraw } from "../index";
import { expect } from "vitest";
import { getTextEditor, updateTextEditor } from "./queries/dom";
import { mockMermaidToExcalidraw } from "./helpers/mocks";

mockMermaidToExcalidraw({
  mockRef: true,
  parseMermaidToExcalidraw: async (definition) => {
    const firstLine = definition.split("\n")[0];
    return new Promise((resolve, reject) => {
      if (firstLine === "flowchart TD") {
        resolve({
          elements: [
            {
              id: "Start",
              type: "rectangle",
              groupIds: [],
              x: 0,
              y: 0,
              width: 69.703125,
              height: 44,
              strokeWidth: 2,
              label: {
                groupIds: [],
                text: "Start",
                fontSize: 20,
              },
              link: null,
            },
            {
              id: "Stop",
              type: "rectangle",
              groupIds: [],
              x: 2.7109375,
              y: 94,
              width: 64.28125,
              height: 44,
              strokeWidth: 2,
              label: {
                groupIds: [],
                text: "Stop",
                fontSize: 20,
              },
              link: null,
            },
            {
              id: "Start_Stop",
              type: "arrow",
              groupIds: [],
              x: 34.852,
              y: 44,
              strokeWidth: 2,
              points: [
                [0, 0],
                [0, 50],
              ],
              roundness: {
                type: 2,
              },
              start: {
                id: "Start",
              },
              end: {
                id: "Stop",
              },
            },
          ],
        });
      } else {
        reject(new Error("ERROR"));
      }
    });
  },
});

describe("Test <MermaidToExcalidraw/>", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw
        initialData={{
          appState: {
            openDialog: { name: "ttd", tab: "mermaid" },
          },
        }}
      />,
    );
  });

  it("should open mermaid popup when active tool is mermaid", async () => {
    const dialog = document.querySelector(".ttd-dialog")!;
    await waitFor(() => dialog.querySelector("canvas"));
    expect(dialog.outerHTML).toMatchSnapshot();
  });

  it("should show error in preview when mermaid library throws error", async () => {
    const dialog = document.querySelector(".ttd-dialog")!;

    expect(dialog).not.toBeNull();

    const selector = ".ttd-dialog-input";
    let editor = await getTextEditor(selector, true);

    expect(dialog.querySelector('[data-testid="mermaid-error"]')).toBeNull();

    expect(editor.textContent).toMatchInlineSnapshot(`
      "flowchart TD
       A[Christmas] -->|Get money| B(Go shopping)
       B --> C{Let me think}
       C -->|One| D[Laptop]
       C -->|Two| E[iPhone]
       C -->|Three| F[Car]"
    `);

    await act(async () => {
      updateTextEditor(editor, "flowchart TD1");
      await new Promise((cb) => setTimeout(cb, 0));
    });
    editor = await getTextEditor(selector, false);

    expect(editor.textContent).toBe("flowchart TD1");
    expect(
      dialog.querySelector('[data-testid="mermaid-error"]'),
    ).toMatchInlineSnapshot("null");
  });
});
