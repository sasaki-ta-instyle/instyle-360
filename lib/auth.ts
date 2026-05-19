import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db/client";
import { sendMagicLinkEmail } from "@/lib/mail/resend";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: "database" },
  trustHost: true,
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in?verify=1",
  },
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      from: process.env.MAIL_FROM ?? "noreply@instyle.group",
      maxAge: 60 * 30, // 30 分
      sendVerificationRequest: async ({ identifier, url, expires }) => {
        await sendMagicLinkEmail({ to: identifier, url, expires });
      },
      options: {},
    },
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        // Drizzle adapter は user.id を string で渡してくる
        (session.user as { id?: string; isAdmin?: boolean }).id = user.id;
        // is_admin を session に載せる
        const row = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.id, user.id),
          columns: { isAdmin: true, displayName: true },
        });
        (session.user as { isAdmin?: boolean }).isAdmin = row?.isAdmin ?? false;
        if (row?.displayName) session.user.name = row.displayName;
      }
      return session;
    },
  },
});
