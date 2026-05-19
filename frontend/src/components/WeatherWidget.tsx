/**
 * ユーザーの位置情報を取得し、Open-Meteo API から現在の気象情報を取得して表示するウィジェット。
 * 30 分ごとに天気を自動更新し、ホバー時にツールチップで詳細を表示する。
 *
 * 主なエクスポート:
 * - WeatherWidget: 現在気温と天気アイコンを表示するコンポーネント
 *
 * 呼び出し関係: EditorStatusBar から使用される。
 */
"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "weather-geolocation-consent";

type WeatherState =
  | { status: "idle" | "loading" | "error" | "consent-needed" }
  | { status: "success"; temperature: number; weatherCode: number; updatedAt: Date };

type WeatherConditionKey =
  | "clearSky"
  | "mainlyClear"
  | "partlyCloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "rainShowers"
  | "thunderstorm"
  | "unknown";

// WMO 天気コードから絵文字と翻訳キーへのマッピング
const WMO_MAP: Record<number, { emoji: string; labelKey: WeatherConditionKey }> = {
  0:  { emoji: "☀️",  labelKey: "clearSky" },
  1:  { emoji: "🌤️", labelKey: "mainlyClear" },
  2:  { emoji: "⛅",  labelKey: "partlyCloudy" },
  3:  { emoji: "☁️",  labelKey: "overcast" },
  45: { emoji: "🌫️", labelKey: "fog" },
  48: { emoji: "🌫️", labelKey: "fog" },
  51: { emoji: "🌦️", labelKey: "drizzle" },
  53: { emoji: "🌦️", labelKey: "drizzle" },
  55: { emoji: "🌦️", labelKey: "drizzle" },
  61: { emoji: "🌧️", labelKey: "rain" },
  63: { emoji: "🌧️", labelKey: "rain" },
  65: { emoji: "🌧️", labelKey: "rain" },
  71: { emoji: "❄️",  labelKey: "snow" },
  73: { emoji: "❄️",  labelKey: "snow" },
  75: { emoji: "❄️",  labelKey: "snow" },
  80: { emoji: "🌦️", labelKey: "rainShowers" },
  81: { emoji: "🌦️", labelKey: "rainShowers" },
  82: { emoji: "🌦️", labelKey: "rainShowers" },
  95: { emoji: "⛈️",  labelKey: "thunderstorm" },
  96: { emoji: "⛈️",  labelKey: "thunderstorm" },
  99: { emoji: "⛈️",  labelKey: "thunderstorm" },
};

/** WMO 天気コードに対応する絵文字と翻訳キーを返す。未知のコードは "❓" / "unknown" にフォールバックする。 */
function getWeatherInfo(code: number): { emoji: string; labelKey: WeatherConditionKey } {
  return WMO_MAP[code] ?? { emoji: "❓", labelKey: "unknown" };
}

/**
 * 位置情報を取得して天気データを管理するカスタムフック。
 * 取得失敗・位置情報拒否・AbortError はすべて適切にハンドリングする。
 * 初回マウント時にローカルストレージで同意確認を行い、未同意の場合は consent-needed 状態を返す。
 */
function useWeather(): { state: WeatherState; grantConsent: () => void } {
  const [state, setState] = useState<WeatherState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const startGeolocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    const fetchWeather = (lat: number, lon: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({ status: "loading" });

      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=celsius`,
        { signal: controller.signal }
      )
        .then((res) => {
          if (!res.ok) throw new Error("weather fetch failed");
          return res.json();
        })
        .then((data) => {
          setState({
            status: "success",
            temperature: data.current.temperature_2m,
            weatherCode: data.current.weathercode,
            updatedAt: new Date(),
          });
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            setState({ status: "error" });
          }
        });
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetchWeather(latitude, longitude);
        intervalRef.current = setInterval(
          () => fetchWeather(latitude, longitude),
          30 * 60 * 1000
        );
      },
      () => {
        setState({ status: "error" });
      },
      { timeout: 10_000 }
    );
  };

  useEffect(() => {
    const alreadyGranted =
      typeof localStorage !== "undefined" &&
      localStorage.getItem(CONSENT_KEY) === "granted";

    if (alreadyGranted) {
      startGeolocation();
    } else {
      setState({ status: "consent-needed" });
    }

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
     
  }, []);

  const grantConsent = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(CONSENT_KEY, "granted");
    }
    startGeolocation();
  };

  return { state, grantConsent };
}

/**
 * 天気情報をコンパクトに表示するウィジェット。
 * 未同意の場合は位置情報の用途を説明するチップを表示し、同意後に天気データを取得・表示する。
 * 取得成功時のみ気温を描画し、ホバーでツールチップに詳細（気温・天気状況・最終更新時刻）を表示する。
 */
export const WeatherWidget = memo(function WeatherWidget() {
  const { t } = useTranslation();
  const { state, grantConsent } = useWeather();

  if (state.status === "consent-needed") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-1 text-xs font-mono cursor-pointer bg-accent/50 hover:bg-accent px-2 py-1 rounded-md transition-colors text-muted-foreground"
              data-testid="weather-consent-chip"
            >
              <span>📍</span>
              <span>?</span>
            </div>
          </TooltipTrigger>
          <TooltipContent align="center" sideOffset={5} className="max-w-xs">
            <div className="space-y-2 text-sm font-sans p-1">
              {/* TODO: add i18n */}
              <p className="font-semibold">Weather Widget</p>
              <p>Location is used for weather data and never stored.</p>
              <Button
                size="sm"
                className="w-full mt-1"
                onClick={grantConsent}
                data-testid="weather-consent-allow"
              >
                {/* TODO: add i18n */}
                Allow
              </Button>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (state.status !== "success") {
    return null;
  }

  const { temperature, weatherCode, updatedAt } = state;
  const { emoji, labelKey } = getWeatherInfo(weatherCode);
  const conditionLabel = t(`weather.condition.${labelKey}` as Parameters<typeof t>[0]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-1.5 text-xs font-mono cursor-help bg-accent/50 hover:bg-accent px-2 py-1 rounded-md transition-colors"
            data-testid="weather-widget"
          >
            <span>{emoji}</span>
            <span className="text-muted-foreground">{Math.round(temperature)}°</span>
          </div>
        </TooltipTrigger>
        <TooltipContent align="center" sideOffset={5}>
          <div className="space-y-1 text-sm font-sans">
            <p className="font-semibold">{t("weather.title")}</p>
            <p>{conditionLabel}</p>
            <p className="text-muted-foreground">
              {t("weather.temperature")}: {Math.round(temperature)}°C
            </p>
            <p className="text-muted-foreground text-xs">
              {t("weather.lastUpdated")}:{" "}
              {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
