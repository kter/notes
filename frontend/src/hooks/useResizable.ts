"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface UseResizableOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** 'left' = expand by dragging right, 'right' = expand by dragging left */
  direction?: 'left' | 'right';
}

export function useResizable({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  direction = 'left',
}: UseResizableOptions) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);

  // Keep ref in sync with state
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  // Load saved width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
        // eslint-disable-next-line
        setWidth(parsed);
      }
    }
  }, [storageKey, minWidth, maxWidth]);

  // Save width to localStorage
  const saveWidth = useCallback(
    (newWidth: number) => {
      localStorage.setItem(storageKey, String(newWidth));
    },
    [storageKey]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const startX = e.clientX;
      const startWidth = widthRef.current;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        // For right-side panels, invert the delta (drag left = expand)
        const adjustedDelta = direction === 'right' ? -delta : delta;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + adjustedDelta));
        setWidth(newWidth);
        widthRef.current = newWidth;
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        saveWidth(widthRef.current);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [minWidth, maxWidth, saveWidth, direction]
  );

  return {
    width,
    isResizing,
    handleMouseDown,
  };
}
