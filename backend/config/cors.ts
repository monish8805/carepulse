import { ALLOWED_ORIGINS } from "./env";

// credentials: true is required for the refresh-token cookie to be sent/received
// across the different frontend ports (3001/3002/3003).
export const corsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true,
};
