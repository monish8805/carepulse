import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

type AuthEvent = "login" | "logout";

// One channel per portal comes for free: each portal is its own origin
// (its own port), and a BroadcastChannel only reaches same-origin tabs.
const CHANNEL = "cp-auth";

// Tells this portal's other open tabs that the session changed here.
export function broadcastAuth(event: AuthEvent) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(event);
  channel.close();
}

// Used by each <Portal>Layout. A logout in another tab already revoked the
// shared refresh cookie server-side, so this tab only has to drop its cache
// and go to /login — same order as handleLogout (navigate first, then clear).
// A login elsewhere makes a logged-out tab re-check its session.
export function useAuthSync() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = async (message: MessageEvent<AuthEvent>) => {
      if (message.data === "logout") {
        await navigate({ to: "/login" });
        queryClient.clear();
      } else if (message.data === "login") {
        queryClient.invalidateQueries({ queryKey: ["session"] });
      }
    };
    return () => channel.close();
  }, [navigate, queryClient]);
}
