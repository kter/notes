import { describe, expect, it } from "vitest";

import { chooseSnapshotStrategy } from "./snapshotStrategy";

describe("chooseSnapshotStrategy", () => {
  it("stays local when offline, even with a cursor and a cache", () => {
    expect(
      chooseSnapshotStrategy({ hasLocalCache: true, cursor: "c1", isOnline: false })
    ).toEqual({ kind: "localOnly" });
  });

  it("takes the delta when a cursor and a cache are both present", () => {
    expect(
      chooseSnapshotStrategy({ hasLocalCache: true, cursor: "c1", isOnline: true })
    ).toEqual({ kind: "delta", cursor: "c1" });
  });

  it("falls back to a full snapshot when the cache is empty", () => {
    // カーソルは残っているがキャッシュが消えている状況（別ブラウザでのクリア、
    // ストレージの追い出し）。差分だけを取ると表示が空のままになる。
    expect(
      chooseSnapshotStrategy({ hasLocalCache: false, cursor: "c1", isOnline: true })
    ).toEqual({ kind: "full" });
  });

  it("takes a full snapshot on a first visit", () => {
    expect(
      chooseSnapshotStrategy({ hasLocalCache: false, cursor: null, isOnline: true })
    ).toEqual({ kind: "full" });
  });

  it("takes a full snapshot when a cache exists but no cursor was stored", () => {
    expect(
      chooseSnapshotStrategy({ hasLocalCache: true, cursor: null, isOnline: true })
    ).toEqual({ kind: "full" });
  });
});
