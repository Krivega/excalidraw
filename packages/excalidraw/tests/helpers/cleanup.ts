import { createRoot } from "react-dom/client";

let root: ReturnType<typeof createRoot> | null = null;

export const cleanup = () => {
  if (root) {
    root.unmount();
    root = null;
  }

  // Fallback for legacy cleanup
  const rootElement = document.getElementById("root");
  if (rootElement) {
    // Clear the container
    rootElement.innerHTML = "";
  }
};

export const createTestRoot = () => {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element not found");
  }

  if (!root) {
    root = createRoot(rootElement);
  }

  return root;
};
