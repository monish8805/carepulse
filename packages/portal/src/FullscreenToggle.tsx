import { useEffect, useState } from "react";
import { Maximize, Minimize } from "lucide-react";

export default function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Listens to the document rather than only our own clicks: Esc and F11 also
  // leave fullscreen, and the icon has to follow.
  useEffect(() => {
    function sync() {
      setIsFullscreen(document.fullscreenElement !== null);
    }
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // The browser refused (e.g. fullscreen blocked by policy) — nothing useful to tell the user.
    }
  }

  if (typeof document !== "undefined" && !document.fullscreenEnabled) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-cp-text-muted hover:bg-cp-workspace focus-visible:outline focus-visible:outline-2 focus-visible:outline-cp-primary dark:text-cp-text-muted-dark dark:hover:bg-cp-workspace-dark"
    >
      {isFullscreen ? (
        <Minimize className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
      ) : (
        <Maximize className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
      )}
    </button>
  );
}
