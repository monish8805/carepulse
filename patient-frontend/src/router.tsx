import { createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient, routerDefaults } from "@carepulse/portal";
import { routeTree } from "./routeTree.gen";
// Registers this app's portal with the API client before anything restores a session.
import "./lib/api";

export function getRouter() {
  const queryClient = createQueryClient();
  return createRouter({
    ...routerDefaults,
    routeTree,
    context: { queryClient },
    Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
