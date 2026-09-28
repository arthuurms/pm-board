import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const useSecureCookies = (process.env.NEXTAUTH_URL || "").startsWith("https://");

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // SameSite=Lax (o padrão do NextAuth) nunca fica salvo quando o app é
  // aberto dentro de um iframe de outro domínio (ex: o hub FOURFY) — o
  // login "não funciona" mesmo com a senha certa. SameSite=None resolve,
  // mantendo cada usuário logando com a própria conta normalmente.
  cookies: {
    sessionToken: {
      name: useSecureCookies ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: { httpOnly: true, sameSite: "none", path: "/", secure: useSecureCookies },
    },
    callbackUrl: {
      name: useSecureCookies ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: { sameSite: "none", path: "/", secure: useSecureCookies },
    },
    csrfToken: {
      // NextAuth usa __Host- (não __Secure-) pro csrf-token por padrão —
      // preciso manter o mesmo nome, senão a checagem de CSRF do próprio
      // NextAuth não acha o cookie e recusa o login.
      name: useSecureCookies ? "__Host-next-auth.csrf-token" : "next-auth.csrf-token",
      options: { httpOnly: true, sameSite: "none", path: "/", secure: useSecureCookies },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { permissions: true },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string; role?: string }).id = token.id as string;
        (session.user as { id?: string; role?: string }).role = token.role as string;
      }
      return session;
    },
  },
};
