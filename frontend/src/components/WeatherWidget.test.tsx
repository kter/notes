import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { WeatherWidget } from "./WeatherWidget";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const texts: Record<string, string> = {
        "weather.title": "Weather",
        "weather.temperature": "Temperature",
        "weather.lastUpdated": "Updated",
        "weather.condition.clearSky": "Clear sky",
        "weather.condition.partlyCloudy": "Partly cloudy",
        "weather.condition.rain": "Rain",
        "weather.condition.snow": "Snow",
        "weather.condition.unknown": "Unknown",
      };
      return texts[key] || key;
    },
  }),
}));

const mockGeolocationSuccess = (latitude = 35.6762, longitude = 139.6503) => {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: vi.fn((success) =>
        success({ coords: { latitude, longitude } })
      ),
    },
  });
};

const mockGeolocationDenied = () => {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: vi.fn((_, error) =>
        error({ code: 1, message: "User denied Geolocation" })
      ),
    },
  });
};

// happy-dom では vi.stubGlobal("fetch") が効かないため global に直接代入する
const setupFetchMock = (temperature = 18.3, weathercode = 2) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        current: { temperature_2m: temperature, weathercode },
      }),
  });
  global.fetch = fetchMock;
  return fetchMock;
};

const setupFetchFailure = (status = 500) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
};

describe("WeatherWidget", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // -------------------------
  // 正常系
  // -------------------------

  it("位置情報許可 + API成功時に気温と絵文字を表示する", async () => {
    mockGeolocationSuccess();
    setupFetchMock(18.3, 2); // ⛅ partlyCloudy

    const { getByTestId, getByText } = render(<WeatherWidget />);

    await waitFor(() => {
      expect(getByTestId("weather-widget")).toBeInTheDocument();
    });

    expect(getByText("⛅")).toBeInTheDocument();
    expect(getByText("18°")).toBeInTheDocument();
  });

  it("気温を四捨五入して表示する", async () => {
    mockGeolocationSuccess();
    setupFetchMock(18.6, 0);

    const { getByText } = render(<WeatherWidget />);

    await waitFor(() => {
      expect(getByText("19°")).toBeInTheDocument();
    });
  });

  it("天気コード 0 (快晴) は ☀️ を表示する", async () => {
    mockGeolocationSuccess();
    setupFetchMock(25.0, 0);

    const { getByText } = render(<WeatherWidget />);

    await waitFor(() => {
      expect(getByText("☀️")).toBeInTheDocument();
    });
  });

  it("天気コード 61 (雨) は 🌧️ を表示する", async () => {
    mockGeolocationSuccess();
    setupFetchMock(12.0, 61);

    const { getByText } = render(<WeatherWidget />);

    await waitFor(() => {
      expect(getByText("🌧️")).toBeInTheDocument();
    });
  });

  it("天気コード 71 (雪) は ❄️ を表示する", async () => {
    mockGeolocationSuccess();
    setupFetchMock(0.5, 71);

    const { getByText } = render(<WeatherWidget />);

    await waitFor(() => {
      expect(getByText("❄️")).toBeInTheDocument();
    });
  });

  it("未知の天気コードは ❓ を表示する", async () => {
    mockGeolocationSuccess();
    setupFetchMock(20.0, 999);

    const { getByText } = render(<WeatherWidget />);

    await waitFor(() => {
      expect(getByText("❓")).toBeInTheDocument();
    });
  });

  it("React.memo でラップされている", () => {
    const widgetType = (WeatherWidget as unknown as { $$typeof?: symbol })?.$$typeof;
    expect(widgetType).toBe(Symbol.for("react.memo"));
  });

  // -------------------------
  // エラー系（null を返す）
  // -------------------------

  it("位置情報が拒否された場合は何も表示しない", async () => {
    mockGeolocationDenied();

    const { container } = render(<WeatherWidget />);

    // エラーコールバックは同期的に呼ばれるため即チェック可能
    expect(container.firstChild).toBeNull();
  });

  it("navigator.geolocation が存在しない場合は何も表示しない", () => {
    vi.stubGlobal("navigator", {});

    const { container } = render(<WeatherWidget />);

    expect(container.firstChild).toBeNull();
  });

  it("API fetch が失敗した場合は何も表示しない", async () => {
    mockGeolocationSuccess();
    setupFetchFailure(500);

    const { container } = render(<WeatherWidget />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("ネットワークエラー時は何も表示しない", async () => {
    mockGeolocationSuccess();
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    const { container } = render(<WeatherWidget />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  // -------------------------
  // 更新サイクル（fake timers を使用）
  // -------------------------

  describe("インターバル更新", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("30分後に fetch が再び呼ばれる", async () => {
      mockGeolocationSuccess();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ current: { temperature_2m: 20, weathercode: 0 } }),
      });
      global.fetch = fetchMock;

      render(<WeatherWidget />);

      // 初回 fetch の Promise チェーンを flush
      await act(async () => {});
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 30分経過でインターバル発火
      await act(async () => {
        vi.advanceTimersByTime(30 * 60 * 1000);
      });
      await act(async () => {});
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("アンマウント後は 30分経過しても fetch が呼ばれない", async () => {
      mockGeolocationSuccess();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ current: { temperature_2m: 20, weathercode: 0 } }),
      });
      global.fetch = fetchMock;

      const { unmount } = render(<WeatherWidget />);

      // 初回 fetch の Promise チェーンを flush
      await act(async () => {});
      expect(fetchMock).toHaveBeenCalledTimes(1);

      unmount();

      // アンマウント後に 30分経過
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
