// @carepulse/portal — the application shell and session plumbing shared by
// every CarePulse portal. Each app still owns its routes, pages, nav config and
// <Portal>Layout; this package only holds what is genuinely identical.
export { default as Header } from "./Header";
export { default as Sidebar } from "./Sidebar";
export type { NavItem, NavSection } from "./Sidebar";
export { default as AccountMenu } from "./AccountMenu";
export type { AccountMenuItem } from "./AccountMenu";
export { useSession } from "./session";
export { broadcastAuth, useAuthSync } from "./authSync";
export { prefetch } from "./prefetch";
export { createQueryClient, routerDefaults } from "./router";
