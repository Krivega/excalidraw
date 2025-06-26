import {
  useCallback,
  useDeferredValue as useDeferredValueReact,
  useTransition as useTransitionReact,
} from "react";

/** noop polyfill for v17. Subset of API available */
function useTransitionPolyfill() {
  const startTransition = useCallback((callback: () => void) => callback(), []);
  return [false, startTransition] as const;
}

export const useTransition = useTransitionReact || useTransitionPolyfill;

/** noop polyfill for v17. Subset of API available */
function useDeferredValuePolyfill<T>(value: T): T {
  return value;
}

export const useDeferredValue =
  useDeferredValueReact || useDeferredValuePolyfill;
