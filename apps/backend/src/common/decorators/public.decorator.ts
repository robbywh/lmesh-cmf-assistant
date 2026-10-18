import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "auth:public";

/** Marks a route as reachable without a session (read by the auth guard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
