/**
 * リアルタイムで現在時刻を表示するシンプルな時計コンポーネント。
 * 1 秒ごとに時刻を更新し、サーバーサイドレンダリング時は null を返す。
 *
 * 主なエクスポート:
 * - Clock: 現在時刻を HH:MM 形式で表示するコンポーネント
 *
 * 呼び出し関係: EditorStatusBar から使用される。
 */
"use client";

import { useEffect, useState, memo } from "react";

export const Clock = memo(function Clock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = () => {
      setTime(
        new Date().toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!time) {
    return null;
  }

  return (
    <div className="text-xs text-muted-foreground font-mono" aria-label="Current time">
      {time}
    </div>
  );
});

