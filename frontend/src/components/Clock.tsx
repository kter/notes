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

