import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTabCreate } from "@/tools/tabs";
import { SessionManager } from "../manager";
import { beginTabCreation } from "../tab-creation";
import { AgentWindowRouting } from "../window-routing";

function event<T extends (...args: never[]) => void>() {
  const listeners = new Set<T>();
  return {
    addListener: (fn: T) => listeners.add(fn),
    removeListener: (fn: T) => listeners.delete(fn),
    emit: (...args: Parameters<T>) => {
      for (const fn of [...listeners]) fn(...args);
    },
  };
}

const dispose: Array<() => void> = [];
afterEach(() => {
  for (const stop of dispose.splice(0)) stop();
  vi.useRealTimers();
});

async function fixture() {
  vi.useFakeTimers();
  const windows = new Map<number, chrome.windows.Window>([
    [1, { id: 1, type: "normal", focused: true, incognito: false } as chrome.windows.Window],
    [2, { id: 2, type: "normal", focused: false, incognito: false } as chrome.windows.Window],
    [10, { id: 10, type: "normal", focused: false, incognito: false } as chrome.windows.Window],
  ]);
  const tabs = new Map<number, chrome.tabs.Tab>([
    [100, { id: 100, windowId: 10, active: true, incognito: false } as chrome.tabs.Tab],
  ]);
  const agentWindow = {
    create: vi.fn(async () => ({ windowId: 10, initialTabIds: [100] })),
    ensureActiveTab: async (windowId: number) => windowId * 10,
    remove: async () => {},
  };
  const manager = new SessionManager({ agentWindow });
  const task = await manager.start("agent");
  let nextWindow = 20;
  const api = {
    tabs: {
      onCreated: event<(tab: chrome.tabs.Tab) => void>(),
      onAttached: event<(id: number, info: object) => void>(),
      onDetached: event<(id: number, info: object) => void>(),
      onUpdated: event<(id: number, info: object, tab: chrome.tabs.Tab) => void>(),
      onRemoved: event<(id: number, info: object) => void>(),
      get: vi.fn(async (id: number) => {
        const tab = tabs.get(id);
        if (!tab) throw new Error("No tab");
        return { ...tab };
      }),
      query: vi.fn(async ({ windowId }: { windowId: number }) =>
        [...tabs.values()].filter((t) => t.windowId === windowId),
      ),
      move: vi.fn(async (id: number, { windowId }: { windowId: number }) => {
        if (!windows.has(windowId)) throw new Error("No window");
        const tab = tabs.get(id)!;
        api.tabs.onDetached.emit(id, { oldWindowId: tab.windowId });
        tab.windowId = windowId;
        api.tabs.onAttached.emit(id, { newWindowId: windowId });
        return { ...tab };
      }),
      update: vi.fn(async (id: number, change: object) => Object.assign(tabs.get(id)!, change)),
    },
    windows: {
      onFocusChanged: event<(id: number) => void>(),
      onRemoved: event<(id: number) => void>(),
      get: vi.fn(async (id: number) => {
        const window = windows.get(id);
        if (!window) throw new Error("No window");
        return { ...window };
      }),
      getAll: vi.fn(async () => [...windows.values()].map((w) => ({ ...w }))),
      create: vi.fn(async ({ tabId }: { tabId: number }) => {
        const id = nextWindow++;
        const window = {
          id,
          type: "normal",
          incognito: tabs.get(tabId)!.incognito,
          focused: false,
        } as chrome.windows.Window;
        windows.set(id, window);
        await api.tabs.move(tabId, { windowId: id });
        return window;
      }),
      update: vi.fn(async (id: number, change: object) => Object.assign(windows.get(id)!, change)),
    },
    webNavigation: {
      onCreatedNavigationTarget: event<(details: { tabId: number; sourceTabId: number }) => void>(),
    },
  };
  const userControlled = vi.fn(() => false);
  const router = new AgentWindowRouting(manager, api as unknown as typeof chrome, userControlled);
  dispose.push(() => router.dispose());
  await vi.advanceTimersByTimeAsync(0);
  function add(id: number, props: Partial<chrome.tabs.Tab> = {}) {
    const tab = {
      id,
      windowId: 10,
      active: false,
      incognito: false,
      index: 1,
      ...props,
    } as chrome.tabs.Tab;
    tabs.set(id, tab);
    api.tabs.onCreated.emit(tab);
    return tab;
  }
  async function focus(id: number) {
    for (const window of windows.values()) window.focused = window.id === id;
    api.windows.onFocusChanged.emit(id);
    await vi.advanceTimersByTimeAsync(0);
  }
  return { api, manager, task, router, tabs, windows, add, focus, userControlled, agentWindow };
}

describe("Agent Window routing", () => {
  it("returns unrelated tabs to the last user window after viewing the task", async () => {
    const f = await fixture();
    await f.focus(2);
    await f.focus(10);
    f.add(101, { active: true });
    await vi.advanceTimersByTimeAsync(150);
    expect(f.tabs.get(101)?.windowId).toBe(2);
    expect(f.api.windows.update).toHaveBeenCalledWith(2, { focused: true });
    expect(f.api.tabs.update).toHaveBeenCalledWith(101, { active: true });
    expect(f.task.agentCreatedTabs.has(101)).toBe(false);
  });

  it("does not steal focus or select a user tab for a background arrival", async () => {
    const f = await fixture();
    await f.focus(-1);
    f.add(101, { active: true });
    await vi.advanceTimersByTimeAsync(150);
    expect(f.tabs.get(101)?.windowId).toBe(1);
    expect(f.api.windows.update).not.toHaveBeenCalled();
    expect(f.api.tabs.update).not.toHaveBeenCalled();
  });

  it("creates one replacement user window for simultaneous arrivals", async () => {
    const f = await fixture();
    f.windows.delete(1);
    f.windows.delete(2);
    f.add(101);
    f.add(102);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.windows.create).toHaveBeenCalledExactlyOnceWith({
      tabId: 101,
      type: "normal",
      focused: false,
    });
    expect(f.tabs.get(101)?.windowId).toBe(20);
    expect(f.tabs.get(102)?.windowId).toBe(20);
  });

  it("excludes other task windows and incompatible private windows", async () => {
    const f = await fixture();
    f.agentWindow.create.mockResolvedValueOnce({ windowId: 11, initialTabIds: [110] });
    await f.manager.start("other");
    f.windows.set(11, { ...f.windows.get(10)!, id: 11 });
    f.windows.delete(1);
    f.windows.get(2)!.incognito = true;
    f.add(101);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.tabs.get(101)?.windowId).toBe(20);
    expect(f.api.windows.create).toHaveBeenCalledOnce();
  });

  it("preserves the private browsing context when a replacement is needed", async () => {
    const f = await fixture();
    f.windows.get(10)!.incognito = true;
    f.add(101, { incognito: true });
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.windows.create).toHaveBeenCalledExactlyOnceWith({
      tabId: 101,
      type: "normal",
      focused: false,
      incognito: true,
    });
  });

  it("waits for the actual create result while a user opens another tab", async () => {
    const f = await fixture();
    let complete!: (tab: chrome.tabs.Tab) => void;
    const created = new Promise<chrome.tabs.Tab>((resolve) => {
      complete = resolve;
    });
    const work = handleTabCreate(
      f.manager,
      { session_id: "agent" },
      {
        tabs: { ...f.api.tabs, create: () => created } as never,
      },
    );
    f.add(101);
    const own = f.add(102);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
    complete(own);
    await work;
    await vi.advanceTimersByTimeAsync(0);
    expect(f.tabs.get(101)?.windowId).toBe(1);
    expect(f.tabs.get(102)?.windowId).toBe(10);
  });

  it("keeps claimed, borrowing and page-opened tabs without claiming unrelated ones", async () => {
    const f = await fixture();
    f.task.agentCreatedTabs.add(101);
    f.add(101);
    f.manager.tryReserveBorrow(102, "agent");
    f.add(102);
    f.add(103, { openerTabId: 100 });
    f.api.webNavigation.onCreatedNavigationTarget.emit({ tabId: 103, sourceTabId: 100 });
    f.add(104);
    f.api.webNavigation.onCreatedNavigationTarget.emit({ tabId: 104, sourceTabId: 100 });
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
    expect(f.task.agentCreatedTabs).toEqual(new Set([100, 101]));
    // Later updates must not reinterpret a noopener child as an external link.
    f.api.tabs.onUpdated.emit(104, { status: "complete" }, f.tabs.get(104)!);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
  });

  it("routes external tabs even when Chrome gives them an opener", async () => {
    const f = await fixture();
    f.add(101, { openerTabId: 100 });
    await vi.advanceTimersByTimeAsync(150);
    expect(f.tabs.get(101)?.windowId).toBe(1);
  });

  it("waits for popup observation to settle before routing", async () => {
    const f = await fixture();
    const finish = beginTabCreation(f.task);
    f.add(101);
    await vi.advanceTimersByTimeAsync(500);
    f.task.observedTabs = new Set([101]);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
  });

  it("scans tabs opened during session startup", async () => {
    const f = await fixture();
    f.tabs.set(101, { id: 101, windowId: 10, incognito: false } as chrome.tabs.Tab);
    f.router.sync();
    await vi.advanceTimersByTimeAsync(150);
    expect(f.tabs.get(101)?.windowId).toBe(1);
    expect(f.tabs.get(100)?.windowId).toBe(10);
  });

  it("leaves user interactions during recording or human assistance alone", async () => {
    const f = await fixture();
    f.userControlled.mockReturnValue(true);
    f.add(101);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
  });

  it("does not move tabs after session termination", async () => {
    const f = await fixture();
    f.add(101);
    await f.manager.stop("agent", { dropOnly: true });
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
    f.router.dispose();
    expect(f.tabs.get(101)?.windowId).toBe(10);
  });

  it("can reconsider a tab if a session teardown did not close its window", async () => {
    const f = await fixture();
    f.add(101);
    await f.manager.withExpectedWindowClose(f.task, () => vi.advanceTimersByTimeAsync(150));
    expect(f.api.tabs.move).not.toHaveBeenCalled();
    f.api.tabs.onUpdated.emit(101, { status: "complete" }, f.tabs.get(101)!);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.tabs.get(101)?.windowId).toBe(1);
  });

  it.each([
    "relocation",
    "disposal",
    "borrow",
  ])("rechecks %s during destination lookup", async (change) => {
    const f = await fixture();
    const getAll = f.api.windows.getAll.getMockImplementation()!;
    f.api.windows.getAll.mockImplementationOnce(async () => {
      if (change === "relocation") f.tabs.get(101)!.windowId = 2;
      if (change === "disposal") f.router.dispose();
      if (change === "borrow") f.manager.tryReserveBorrow(101, "agent");
      return getAll();
    });
    f.add(101);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
    expect(f.api.windows.create).not.toHaveBeenCalled();
  });

  it("retains navigation provenance arriving during destination lookup", async () => {
    const f = await fixture();
    const getAll = f.api.windows.getAll.getMockImplementation()!;
    f.api.windows.getAll.mockImplementationOnce(async () => {
      f.api.webNavigation.onCreatedNavigationTarget.emit({ tabId: 101, sourceTabId: 100 });
      return getAll();
    });
    f.add(101);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
  });

  it("preserves a borrowing tab when attachment precedes commit", async () => {
    const f = await fixture();
    const reservation = f.manager.tryReserveBorrow(101, "agent");
    expect(reservation).toHaveProperty("commit");
    f.tabs.set(101, { id: 101, windowId: 10 } as chrome.tabs.Tab);
    f.api.tabs.onAttached.emit(101, { newWindowId: 10 });
    await vi.advanceTimersByTimeAsync(150);
    expect(f.api.tabs.move).not.toHaveBeenCalled();
  });

  it("retries a failed move and reselects a destination that has closed", async () => {
    const f = await fixture();
    f.api.tabs.move.mockImplementationOnce(async () => {
      f.windows.delete(1);
      throw new Error("Window closed");
    });
    f.add(101);
    await vi.advanceTimersByTimeAsync(500);
    expect(f.tabs.get(101)?.windowId).toBe(2);
    expect(f.api.windows.create).not.toHaveBeenCalled();
  });

  it("does not refocus Chrome if the user switches applications during a move", async () => {
    const f = await fixture();
    await f.focus(10);
    const move = f.api.tabs.move.getMockImplementation()!;
    f.api.tabs.move.mockImplementationOnce(async (id, options) => {
      f.api.windows.onFocusChanged.emit(-1);
      return move(id, options);
    });
    f.add(101, { active: true });
    await vi.advanceTimersByTimeAsync(150);
    expect(f.tabs.get(101)?.windowId).toBe(1);
    expect(f.api.windows.update).not.toHaveBeenCalled();
  });
});
