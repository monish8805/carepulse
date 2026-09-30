import { queryOptions } from "@tanstack/react-query";
import { getBackendHealth, listMyConsents } from "@/lib/api";

export const healthQuery = queryOptions({ queryKey: ["health"], queryFn: getBackendHealth });

export const consentsQuery = queryOptions({ queryKey: ["consents"], queryFn: listMyConsents });
