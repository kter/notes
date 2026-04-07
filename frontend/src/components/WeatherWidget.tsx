"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type WeatherState =
  | { status: "idle" | "loading" | "error" }
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

function getWeatherInfo(code: number): { emoji: string; labelKey: WeatherConditionKey } {
  return WMO_MAP[code] ?? { emoji: "❓", labelKey: "unknown" };
}

function useWeather(): WeatherState {
  const [state, setState] = useState<WeatherState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

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

    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return state;
}

export const WeatherWidget = memo(function WeatherWidget() {
  const { t } = useTranslation();
  const state = useWeather();

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
