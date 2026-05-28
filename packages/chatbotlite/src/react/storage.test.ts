import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LocalChatStorage } from "./storage.js";

describe("LocalChatStorage", () => {
  describe("happy path (jsdom localStorage available)", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("round-trips messages", async () => {
      const s = new LocalChatStorage();
      await s.saveMessages("sess1", [
        { id: "1", role: "user", content: "hi", timestamp: 1 }
      ]);
      const m = await s.loadMessages("sess1");
      expect(m).toHaveLength(1);
      expect(m[0]!.content).toBe("hi");
    });

    it("round-trips title", async () => {
      const s = new LocalChatStorage();
      await s.saveTitle("sess1", "Pricing question");
      expect(await s.loadTitle("sess1")).toBe("Pricing question");
    });

    it("loadMessages returns [] for unknown session", async () => {
      const s = new LocalChatStorage();
      expect(await s.loadMessages("never-saved")).toEqual([]);
    });

    it("loadTitle returns null for unknown session", async () => {
      const s = new LocalChatStorage();
      expect(await s.loadTitle("never-saved")).toBeNull();
    });

    it("custom prefix scopes keys", async () => {
      const a = new LocalChatStorage("scopeA");
      const b = new LocalChatStorage("scopeB");
      await a.saveTitle("s", "A's title");
      await b.saveTitle("s", "B's title");
      expect(await a.loadTitle("s")).toBe("A's title");
      expect(await b.loadTitle("s")).toBe("B's title");
    });
  });

  describe("SSR safety (no window/localStorage)", () => {
    // We simulate the SSR environment by making localStorage throw on every access.
    // The class shouldn't crash — every method has a try/catch with a sensible default.
    let originalLocalStorage: Storage;

    beforeEach(() => {
      originalLocalStorage = globalThis.localStorage;
      const throwingStorage = new Proxy({} as Storage, {
        get: () => {
          throw new ReferenceError("localStorage is not defined");
        }
      });
      Object.defineProperty(globalThis, "localStorage", {
        value: throwingStorage,
        configurable: true,
        writable: true
      });
    });

    afterEach(() => {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalLocalStorage,
        configurable: true,
        writable: true
      });
    });

    it("constructs without throwing in SSR-like context", () => {
      expect(() => new LocalChatStorage()).not.toThrow();
    });

    it("loadMessages returns [] when localStorage throws", async () => {
      const s = new LocalChatStorage();
      await expect(s.loadMessages("any")).resolves.toEqual([]);
    });

    it("saveMessages swallows error when localStorage throws", async () => {
      const s = new LocalChatStorage();
      await expect(
        s.saveMessages("any", [{ id: "1", role: "user", content: "hi", timestamp: 1 }])
      ).resolves.toBeUndefined();
    });

    it("loadTitle returns null when localStorage throws", async () => {
      const s = new LocalChatStorage();
      await expect(s.loadTitle("any")).resolves.toBeNull();
    });

    it("saveTitle swallows error when localStorage throws", async () => {
      const s = new LocalChatStorage();
      await expect(s.saveTitle("any", "title")).resolves.toBeUndefined();
    });
  });

  describe("malformed payload", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("loadMessages returns [] when JSON.parse fails", async () => {
      localStorage.setItem("cbl-bad-msgs", "{not-json");
      const s = new LocalChatStorage();
      expect(await s.loadMessages("bad")).toEqual([]);
    });
  });

  describe("quota exceeded (saveMessages)", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("saveMessages swallows QuotaExceededError", async () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = vi.fn(() => {
        throw new Error("QuotaExceededError");
      });
      try {
        const s = new LocalChatStorage();
        await expect(
          s.saveMessages("sess", [
            { id: "1", role: "user", content: "hi", timestamp: 1 }
          ])
        ).resolves.toBeUndefined();
      } finally {
        Storage.prototype.setItem = original;
      }
    });
  });
});
