/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Two providers:
 *
 * 1. **Credentials** — email + password against our own `User` table, hashed
 *    with bcrypt. This is the primary path and needs no third-party account:
 *    guests can book with an account, and the owner signs in with a seeded
 *    admin. The Prisma adapter is *not* used for credentials; Auth.js's adapter
 *    only knows about OAuth-style providers, so the password check and the
 *    `User` row are handled explicitly here.
 *
 * 2. **Google** — added only when credentials are present. Conditionally
 *    including a provider (rather than configuring it with empty strings) is
 *    what lets the app run with zero third-party configuration: the sign-in
 *    page hides the Google button when `googleEnabled` is false.
 *
 * `role` is carried on the session so middleware and server components can make
 * authorisation decisions without a database round trip on every render.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "./db";
import { claimGuestReservations } from "./claim-reservations";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    // Both the customer dashboard and the staff dashboard share one sign-in
    // page; it adapts to whether the user is an admin.
    signIn: "/signin",
  },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });

        // Compare even when the user is missing, so a failed lookup and a wrong
        // password take the same amount of time and cannot be used to discover
        // which email addresses have accounts.
        const hash = user?.password ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
        const ok = await compare(parsed.data.password, hash);

        if (!user || !user.password || !ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    /**
     * Runs on every sign-in. Three jobs, in order:
     *
     * 1. Link a Google sign-in to an existing row (matched by verified email).
     * 2. Claim any guest bookings made under that address before the account
     *    existed, so "My bookings" is not mysteriously empty for someone who
     *    booked as a stranger and then registered.
     * 3. Keep the `role` column from going stale.
     *
     * The claim is deliberately here and not in a server action. This callback
     * is the only place that has both halves of the fact needed to justify it —
     * an email address Auth.js has just *verified*, and the user id it has just
     * matched that address to. See `lib/claim-reservations.ts` for why the
     * `userId: null` filter makes it safe.
     */
    async signIn({ user, account }) {
      if (!user.id || !user.email) {
        // Credentials `authorize` always returns an id and an email; if either
        // is somehow absent there is nothing to claim and nothing to trust.
        return account?.provider === "credentials" ? true : false;
      }

      const email = user.email.toLowerCase();

      if (account?.provider === "credentials") {
        await claimGuestReservations(user.id, email);
        return true;
      }

      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, image: true },
      });

      if (existing) {
        // Keep the avatar current without clobbering a name the user set.
        await prisma.user.update({
          where: { id: existing.id },
          data: { image: user.image ?? existing.image, emailVerified: new Date() },
        });
        await claimGuestReservations(existing.id, email);
        return true;
      }

      await prisma.user.create({
        data: {
          id: user.id,
          email,
          name: user.name,
          image: user.image,
          emailVerified: new Date(),
          role: "CUSTOMER",
        },
      });
      // Claimed *after* the insert, against the id the row actually got, so the
      // `userId` written onto the reservations is guaranteed to satisfy the
      // foreign key rather than being an assumption about what Prisma would
      // have generated.
      await claimGuestReservations(user.id, email);
      return true;
    },

    /** Copies `id` and `role` onto the token so the JWT carries authorisation. */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "CUSTOMER";
      }
      return token;
    },

    /**
     * Exposes the fields to `auth()` on the server and to client components.
     * Always re-reads the role from the database: if the owner demotes an
     * admin, the change takes effect on their next session rather than when
     * their token happens to expire.
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? token.sub ?? "";
        session.user.role = (token.role as "CUSTOMER" | "ADMIN") ?? "CUSTOMER";
      }
      return session;
    },
  },
});

/** Convenience: the signed-in user, or null. */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** Throws unless a signed-in user exists. For use inside server actions. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/** Throws unless a signed-in *admin* exists. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}
