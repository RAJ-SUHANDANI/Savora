import { handlers } from "@/lib/auth";

/**
 * Auth.js route handler. The `auth` object owns all four OAuth/credential
 * endpoints, so this file stays a one-liner no matter how many providers are
 * enabled.
 */
export const { GET, POST } = handlers;
