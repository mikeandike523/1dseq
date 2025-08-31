import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { throttle } from "lodash";

export type SizeMeasurement = { width: number; height: number } | null;

export interface UseMeasureElementOptions {
  /** Interval duration (ms) for throttling and polling. Default: 100 */
  intervalMs?: number;
  /**
   * If true, use layout size (pre-transform) based on clientWidth/clientHeight.
   * If false (default), use getBoundingClientRect() for true visual size (post-transform).
   */
  useLayoutSize?: boolean;
}

/**
 * React hook that measures an element's size (width, height).
 *
 * - Accepts a RefObject<HTMLElement>.
 * - Returns `null` until it has measured for the first time.
 * - Measures once on mount.
 * - Uses `ResizeObserver` when available (runtime-checked); otherwise falls back to polling.
 * - Updates are `lodash/throttle`d (default 100ms).
 * - When polling, state updates only occur if the size actually changed.
 */
export default function useMeasureElement<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: UseMeasureElementOptions = {}
): SizeMeasurement {
  const { intervalMs = 100, useLayoutSize = false } = options;

  const [size, setSize] = useState<SizeMeasurement>(null);
  const lastSizeRef = useRef<SizeMeasurement>(null);

  const readSize = useCallback((): SizeMeasurement => {
    const el = ref.current;
    if (!el) return null;

    if (useLayoutSize) {
      // Layout size before transforms; integers.
      const width = el.clientWidth ?? (el as HTMLElement).offsetWidth;
      const height = el.clientHeight ?? (el as HTMLElement).offsetHeight;
      return { width, height };
    } else {
      const rect = el.getBoundingClientRect();
      // Visual size after transforms; floats.
      return { width: rect.width, height: rect.height };
    }
  }, [ref, useLayoutSize]);

  const commitIfChanged = useCallback((next: SizeMeasurement) => {
    const prev = lastSizeRef.current;
    if (!next) return;
    if (!prev || prev.width !== next.width || prev.height !== next.height) {
      lastSizeRef.current = next;
      setSize(next);
    }
  }, []);

  const throttledMeasure = useMemo(
    () =>
      throttle(() => {
        const next = readSize();
        if (next) commitIfChanged(next);
      }, intervalMs),
    [readSize, commitIfChanged, intervalMs]
  );

  // Initial measurement when the element is present
  useEffect(() => {
    const next = readSize();
    if (next) commitIfChanged(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readSize]);

  // Cascading remeasurements - run on every render to catch layout changes
  useEffect(() => {
    const next = readSize();
    if (next) commitIfChanged(next);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const hasRO =
      typeof window !== "undefined" &&
      typeof (
        window as object as {
          ResizeObserver?: unknown;
        }
      ).ResizeObserver !== "undefined";

    if (hasRO) {
      const RO: typeof ResizeObserver = (
        window as object as {
          ResizeObserver: typeof ResizeObserver;
        }
      ).ResizeObserver;
      const observer = new RO(throttledMeasure);

      observer.observe(el);

      return () => {
        observer.disconnect();
        throttledMeasure.cancel();
      };
    } else {
      const id = window.setInterval(() => {
        const next = readSize();
        if (next) commitIfChanged(next);
      }, intervalMs);

      return () => {
        window.clearInterval(id);
        throttledMeasure.cancel();
      };
    }
  }, [ref, throttledMeasure, readSize, commitIfChanged, intervalMs]);

  return size;
}
