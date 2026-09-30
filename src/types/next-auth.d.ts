import type { DefaultSession } from "next-auth";

/**
 * Module augmentation so `session.user.id` and `session.user.role` are typed
 * everywhere. Without this, every component would need a cast.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "CUSTOMER" | "ADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "CUSTOMER" | "ADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "CUSTOMER" | "ADMIN";
  }
}

export {};
