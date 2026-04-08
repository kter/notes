import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  SunlightMap,
  calculateSubSolarPoint,
  calculateTerminatorPath,
} from "./SunlightMap";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const texts: Record<string, string> = {
        "sunlightMap.title": "Sunlight Map",
        "sunlightMap.description": "Current day and night areas on Earth",
      };
      return texts[key] || key;
    },
  }),
}));

describe("SunlightMap", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("SVG要素が描画される", () => {
    const { getByTestId } = render(<SunlightMap />);
    expect(getByTestId("sunlight-map")).toBeInTheDocument();
  });

  it("夜間オーバーレイパスが描画される", () => {
    const { getByTestId } = render(<SunlightMap />);
    expect(getByTestId("sunlight-map-night")).toBeInTheDocument();
  });

  it("React.memoでラップされている", () => {
    expect(
      (SunlightMap as unknown as { $$typeof?: symbol })?.$$typeof
    ).toBe(Symbol.for("react.memo"));
  });
});

describe("calculateSubSolarPoint", () => {
  it("夏至近くでは太陽赤緯が +23.44° 付近になる", () => {
    const { lat } = calculateSubSolarPoint(new Date("2024-06-21T12:00:00Z"));
    expect(lat).toBeCloseTo(23.44, 0);
  });

  it("冬至近くでは太陽赤緯が -23.44° 付近になる", () => {
    const { lat } = calculateSubSolarPoint(new Date("2024-12-21T12:00:00Z"));
    expect(lat).toBeCloseTo(-23.44, 0);
  });

  it("春分近くでは太陽赤緯が 0° 付近になる", () => {
    const { lat } = calculateSubSolarPoint(new Date("2024-03-20T12:00:00Z"));
    expect(Math.abs(lat)).toBeLessThan(5);
  });

  it("UTC 12:00 では太陽経度が 0° 付近になる", () => {
    const { lon } = calculateSubSolarPoint(new Date("2024-06-15T12:00:00Z"));
    expect(lon).toBeCloseTo(0, 0);
  });

  it("UTC 00:00 では太陽経度が ±180° 付近になる", () => {
    const { lon } = calculateSubSolarPoint(new Date("2024-06-15T00:00:00Z"));
    expect(Math.abs(lon)).toBeCloseTo(180, 0);
  });
});

describe("calculateTerminatorPath", () => {
  it("有効な SVG パス文字列を返す", () => {
    const path = calculateTerminatorPath(23.44, 0);
    expect(path).toMatch(/^M \d/);
    expect(path).toContain("Z");
    expect(path).toContain("L ");
  });

  it("sunLat > 0 のとき南極側 (y=180) を通じて閉じる", () => {
    const path = calculateTerminatorPath(23.44, 0);
    expect(path).toContain("L 360,180 L 0,180");
  });

  it("sunLat < 0 のとき北極側 (y=0) を通じて閉じる", () => {
    const path = calculateTerminatorPath(-23.44, 0);
    expect(path).toContain("L 360,0 L 0,0");
  });

  it("赤道付近 (sunLat ≈ 0) でもクラッシュしない", () => {
    expect(() => calculateTerminatorPath(0.001, 0)).not.toThrow();
    expect(() => calculateTerminatorPath(0, 0)).not.toThrow();
  });

  it("sunLon が変わるとパスが変わる", () => {
    const path1 = calculateTerminatorPath(23.44, 0);
    const path2 = calculateTerminatorPath(23.44, 90);
    expect(path1).not.toBe(path2);
  });
});

describe("SunlightMap インターバル更新", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("60秒後もコンポーネントが正常に表示される", async () => {
    const { getByTestId } = render(<SunlightMap />);

    await act(async () => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(getByTestId("sunlight-map")).toBeInTheDocument();
  });

  it("アンマウント後はインターバルが解除される", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    const { unmount } = render(<SunlightMap />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
