import { queryOptions } from "@tanstack/react-query";
import { getBackendHealth, listMyConsents, listMyVitals } from "@/lib/api";

export const healthQuery = queryOptions({ queryKey: ["health"], queryFn: getBackendHealth });

export const consentsQuery = queryOptions({ queryKey: ["consents"], queryFn: listMyConsents });

export const myVitalsQuery = queryOptions({ queryKey: ["myVitals"], queryFn: listMyVitals });
