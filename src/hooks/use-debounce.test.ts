import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedCallback } from "./use-debounce";

describe("useDebouncedCallback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses rapid calls into the last one", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(cb, 1000));
    result.current("a");
    result.current("b");
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("b");
  });

  it("debounces different keys independently", () => {
    const cb = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback(cb, 1000, (id: string) => id),
    );
    result.current("scene-1", "text 1");
    result.current("scene-2", "text 2");
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledWith("scene-1", "text 1");
    expect(cb).toHaveBeenCalledWith("scene-2", "text 2");
  });

  it("flushes pending calls on unmount instead of dropping them", () => {
    const cb = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(cb, 1000));
    result.current("unsaved");
    unmount();
    expect(cb).toHaveBeenCalledWith("unsaved");
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("flushes pending calls when the tab is hidden", () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(cb, 1000));
    result.current("unsaved");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cb).toHaveBeenCalledWith("unsaved");
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
});
