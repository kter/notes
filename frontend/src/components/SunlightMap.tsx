/**
 * 現在の日照・夜間エリアをリアルタイムで世界地図上に描画するコンポーネント。
 * 太陽直下点計算とターミネータライン（昼夜境界線）SVG パスを 1 分ごとに更新する。
 *
 * 主なエクスポート:
 * - SunlightMap: SVG ベースの日照マップコンポーネント
 * - calculateSubSolarPoint: 日時から太陽直下点（緯度・経度）を計算するユーティリティ
 * - calculateTerminatorPath: 太陽直下点から夜間領域の SVG パス文字列を生成するユーティリティ
 *
 * 呼び出し関係: EditorToolbar から使用される。
 */
"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { CONTINENT_PATHS } from "./sunlightMapData";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** UTC 日付から年初からの経過日数（1 始まり）を返す。太陽赤緯計算に使用する。 */
function getDayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * 指定日時における太陽直下点（緯度・経度）を近似計算する。
 * 緯度は太陽赤緯（最大 ±23.44°）、経度は UTC 時刻から日付変更線基準で算出する。
 */
export function calculateSubSolarPoint(date: Date): { lat: number; lon: number } {
  const dayOfYear = getDayOfYear(date);
  const lat = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
  const minutesUTC =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const lon = 180 - (minutesUTC / 1440) * 360;
  return { lat, lon };
}

/**
 * 太陽直下点（緯度・経度）から夜間領域の SVG パス文字列を生成する。
 * 経度 2° ステップでターミネータラインの各点を計算し、極側を閉じて夜間ポリゴンを形成する。
 * 赤道面付近（tan(0) の発散）を避けるため sunLat に微小オフセットを適用する。
 */
export function calculateTerminatorPath(sunLat: number, sunLon: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;

  // Avoid tan(0) division at equinox
  const effectiveSunLat =
    Math.abs(sunLat) < 0.1 ? (sunLat >= 0 ? 0.1 : -0.1) : sunLat;
  const tanDecl = Math.tan(toRad(effectiveSunLat));

  const pts: string[] = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const cosHA = Math.cos(toRad(lon - sunLon));
    const termLat = (Math.atan(-cosHA / tanDecl) * 180) / Math.PI;
    pts.push(`${lon + 180},${(90 - termLat).toFixed(1)}`);
  }

  let path = `M ${pts[0]}`;
  for (let i = 1; i < pts.length; i++) path += ` L ${pts[i]}`;

  // Close via the pole that is in darkness
  if (effectiveSunLat > 0) {
    path += " L 360,180 L 0,180";
  } else {
    path += " L 360,0 L 0,0";
  }
  return path + " Z";
}

/** 1 分ごとに太陽直下点を再計算し、最新の緯度・経度を返すカスタムフック。 */
function useSolarTerminator() {
  const [solar, setSolar] = useState(() => calculateSubSolarPoint(new Date()));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSolar(calculateSubSolarPoint(new Date()));
    intervalRef.current = setInterval(() => {
      setSolar(calculateSubSolarPoint(new Date()));
    }, 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return solar;
}

/** ブラウザの Geolocation API からユーザーの現在地を一度だけ取得するカスタムフック。取得失敗時は null を返す。 */
function useGeolocation(): { lat: number; lon: number } | null {
  const [position, setPosition] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        // Geolocation denied or unavailable — no dot
      },
      { timeout: 10_000 }
    );
  }, []);

  return position;
}

/**
 * 世界地図上に現在の昼夜分布をリアルタイム描画するコンポーネント。
 * 大陸のアウトラインと夜間オーバーレイを SVG で重ね、ユーザー位置を赤いドットで示す。
 */
export const SunlightMap = memo(function SunlightMap() {
  const { t } = useTranslation();
  const { lat: sunLat, lon: sunLon } = useSolarTerminator();
  const userPosition = useGeolocation();

  const nightPath = useMemo(
    () => calculateTerminatorPath(sunLat, sunLon),
    [sunLat, sunLon]
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="hidden lg:flex flex-1 items-center justify-center min-w-0 mx-2"
            data-testid="sunlight-map"
          >
            <svg
              viewBox="0 0 360 180"
              preserveAspectRatio="none"
              className="h-9 rounded-sm opacity-80"
              width={160}
              aria-label={t("sunlightMap.title")}
              role="img"
            >
              {/* Ocean background */}
              <rect
                width="360"
                height="180"
                className="fill-slate-200 dark:fill-slate-700"
              />
              {/* Continent fills */}
              <g className="fill-slate-400/60 dark:fill-slate-500/60">
                {CONTINENT_PATHS.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
              {/* Night overlay */}
              <path
                data-testid="sunlight-map-night"
                d={nightPath}
                className="fill-slate-900/40 dark:fill-black/60"
              />
              {/* Continent outlines drawn on top for visibility */}
              <g
                className="fill-none stroke-slate-500/50 dark:stroke-slate-400/50"
                strokeWidth="0.5"
              >
                {CONTINENT_PATHS.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
              {/* Current location dot */}
              {userPosition && (
                <circle
                  data-testid="sunlight-map-location"
                  cx={userPosition.lon + 180}
                  cy={90 - userPosition.lat}
                  r={3}
                  fill="red"
                  stroke="white"
                  strokeWidth={0.8}
                  aria-label={t("sunlightMap.yourLocation")}
                />
              )}
            </svg>
          </div>
        </TooltipTrigger>
        <TooltipContent align="center" sideOffset={5}>
          <div className="space-y-1 text-sm font-sans">
            <p className="font-semibold">{t("sunlightMap.title")}</p>
            <p className="text-muted-foreground">{t("sunlightMap.description")}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
