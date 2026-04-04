import { useEffect, useState } from "react";

/** Viewport width at or below this is treated as a narrow (phone) layout. */
export const NARROW_PHONE_MAX_WIDTH_PX = 640;

export function useNarrowPhoneLayout(maxWidthPx: number = NARROW_PHONE_MAX_WIDTH_PX): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [maxWidthPx]);

  return matches;
}
