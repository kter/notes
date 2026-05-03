/**
 * SunlightMap コンポーネントで使用する大陸アウトラインの SVG パスデータ。
 * 正距円筒図法（x = 経度 + 180、y = 90 − 緯度）の座標系で表現されており、
 * Natural Earth 50m 海岸線データを簡略化して生成した。
 *
 * 主なエクスポート:
 * - CONTINENT_PATHS: 各大陸の SVG パス文字列配列
 *
 * 呼び出し関係: SunlightMap.tsx から import される。
 */
// Continent outlines for an equirectangular world map.
// Coordinate system: x = longitude + 180 (0–360), y = 90 − latitude (0–180).
// Derived from Natural Earth 50m coastline data, simplified.

export const CONTINENT_PATHS: string[] = [
  // North America
  "M 12,24 L 20,21 L 24,19 L 38,28 L 46,33 L 54,40 L 56,44 L 58,49 L 62,55 L 63,58 L 70,67 L 75,70 L 82,74 L 90,76 L 96,73 L 92,62 L 98,62 L 98,66 L 100,64 L 104,55 L 109,48 L 116,45 L 127,43 L 124,36 L 112,31 L 94,27 L 80,20 L 45,21 Z",

  // Greenland
  "M 129,29 L 134,30 L 138,26 L 156,20 L 160,12 L 140,7 L 112,14 L 112,22 Z",

  // South America
  "M 103,82 L 103,79 L 117,79 L 127,84 L 145,98 L 141,112 L 129,122 L 116,136 L 112,145 L 106,140 L 108,132 L 108,120 L 103,97 L 100,90 Z",

  // Eurasia — traces outer coast from SW Iberia clockwise:
  // W Europe → Scandinavia → N Siberia → E Asia → SE Asia →
  // India → Arabia → Mediterranean back to Iberia
  "M 171,53 L 171,47 L 175,42 L 178,40 L 186,32 L 185,28 L 192,22 L 206,19 L 213,21 L 253,18 L 284,13 L 310,14 L 350,26 L 344,34 L 313,47 L 302,58 L 297,65 L 288,69 L 284,80 L 283,89 L 277,81 L 272,73 L 270,68 L 261,78 L 257,82 L 252,71 L 242,65 L 238,68 L 225,77 L 219,68 L 212,60 L 205,54 L 186,52 L 174,54 Z",

  // Africa
  "M 174,54 L 167,62 L 163,70 L 164,76 L 162,80 L 168,86 L 173,90 L 178,88 L 184,87 L 188,87 L 191,92 L 190,100 L 192,108 L 195,118 L 198,124 L 207,123 L 217,116 L 222,104 L 222,92 L 231,78 L 223,76 L 220,66 L 213,58 L 200,58 L 191,53 L 183,51 L 180,52 L 174,54 Z",

  // Australia
  "M 294,112 L 311,102 L 325,101 L 333,117 L 331,124 L 326,129 L 318,126 L 310,130 L 295,125 Z",

  // Antarctica
  "M 0,158 L 45,155 L 90,157 L 135,155 L 180,158 L 225,155 L 270,157 L 315,155 L 360,158 L 360,180 L 0,180 Z",
];
