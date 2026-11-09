import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSaveStatusForTesting, hasUnsavedWork, runSave, useSaveStatus } from "./saveStatus";

describe("runSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetSaveStatusForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries after an error, using the 5s/10s/20s backoff", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("offline") })
      .mockResolvedValueOnce({ error: new Error("offline") })
      .mockResolvedValueOnce({ error: null });

    await runSave("scene:1", fn);
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fn).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops retrying once a save succeeds", async () => {
    const fn = vi.fn().mockResolvedValue({ error: null });

    await runSave("scene:2", fn);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a newer save for the same key cancels the pending retry", async () => {
    const failing = vi.fn().mockResolvedValue({ error: new Error("offline") });
    const succeeding = vi.fn().mockResolvedValue({ error: null });

    await runSave("scene:3", failing);
    expect(failing).toHaveBeenCalledTimes(1);

    // Newer content arrives before the first retry (5s) fires.
    await runSave("scene:3", succeeding);
    expect(succeeding).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    // The stale retry for `failing` never ran.
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("clears `failing` once the save recovers, for useSaveStatus and hasUnsavedWork", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("offline") })
      .mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useSaveStatus("scene:4"));

    await act(async () => {
      await runSave("scene:4", fn);
    });
    expect(result.current.failing).toBe(true);
    expect(hasUnsavedWork()).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.failing).toBe(false);
    expect(hasUnsavedWork()).toBe(false);
  });

  it("useSaveStatus with a keyPrefix only reflects matching keys", async () => {
    const fn = vi.fn().mockResolvedValue({ error: new Error("offline") });
    const { result: scoped } = renderHook(() => useSaveStatus("note:a"));
    const { result: other } = renderHook(() => useSaveStatus("note:b"));

    await act(async () => {
      await runSave("note:a:title", fn);
    });

    expect(scoped.current.failing).toBe(true);
    expect(other.current.failing).toBe(false);
  });
});
