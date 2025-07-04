import { cleanup } from "./helpers/cleanup";
import { render, GlobalTestState } from "./test-utils";
import { Excalidraw } from "../index";
import { KEYS } from "../keys";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { CURSOR_TYPE } from "../constants";

const { h } = window;
const mouse = new Pointer("mouse");
const touch = new Pointer("touch");
const pen = new Pointer("pen");
const pointerTypes = [mouse, touch, pen];

describe("view mode", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  it("after switching to view mode – cursor type should be pointer", async () => {
    h.setState({ viewModeEnabled: true });
    expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
      CURSOR_TYPE.GRAB,
    );
  });

  it("after switching to view mode, moving, clicking, and pressing space key – cursor type should be pointer", async () => {
    h.setState({ viewModeEnabled: true });

    pointerTypes.forEach((pointerType) => {
      const pointer = pointerType;
      pointer.reset();
      pointer.move(100, 100);
      pointer.click();
      Keyboard.keyPress(KEYS.SPACE);
      expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
        CURSOR_TYPE.GRAB,
      );
    });
  });

  it("cursor should stay as grabbing type when hovering over canvas elements", async () => {
    // create a rectangle, then hover over it – cursor should be
    // move type for mouse and grab for touch & pen
    // then switch to view-mode and cursor should be grabbing type
    UI.createElement("rectangle", { size: 100 });

    pointerTypes.forEach((pointerType) => {
      const pointer = pointerType;

      pointer.moveTo(50, 50);
      // eslint-disable-next-line dot-notation
      if (pointerType["pointerType"] === "mouse") {
        expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
          CURSOR_TYPE.MOVE,
        );
      } else {
        expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
          CURSOR_TYPE.GRAB,
        );
      }

      h.setState({ viewModeEnabled: true });
      expect(GlobalTestState.interactiveCanvas.style.cursor).toBe(
        CURSOR_TYPE.GRAB,
      );
    });
  });
});
