import { compare } from "bcryptjs";
import { FastifyInstance } from "fastify";
import jwt, { JwtPayload } from "jsonwebtoken";
import { UnauthorizedError } from "../../shared/errors";
import { env } from "../../shared/env";

type AuthPayload = {
  id: string;
  role: "MASTER" | "PARTNER";
  partnerId: string | null;
};

function parseRefreshPayload(payload: JwtPayload): AuthPayload {
  return {
    id: String(payload.id),
    role: payload.role as "MASTER" | "PARTNER",
    partnerId: (payload.partnerId as string | null) ?? null
  };
}

function signRefreshToken(payload: AuthPayload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
}

export async function login(app: FastifyInstance, email: string, password: string) {
  const user = await app.prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    throw new UnauthorizedError("Credenciais invalidas");
  }

  const validPassword = await compare(password, user.passwordHash);
  if (!validPassword) {
    throw new UnauthorizedError("Credenciais invalidas");
  }

  const payload: AuthPayload = {
    id: user.id,
    role: user.role,
    partnerId: user.partnerId
  };

  const accessToken = app.jwt.sign(payload, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN
  });
  const refreshToken = signRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    user: payload
  };
}

export async function refreshSession(app: FastifyInstance, refreshToken: string) {
  let payload: AuthPayload;

  try {
    payload = parseRefreshPayload(jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload);
  } catch {
    throw new UnauthorizedError("Refresh token invalido ou expirado");
  }

  const user = await app.prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, role: true, partnerId: true, isActive: true }
  });

  if (!user || !user.isActive) {
    throw new UnauthorizedError("Usuario inativo ou inexistente");
  }

  const freshPayload: AuthPayload = {
    id: user.id,
    role: user.role,
    partnerId: user.partnerId
  };

  return {
    accessToken: app.jwt.sign(freshPayload, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN
    }),
    refreshToken: signRefreshToken(freshPayload),
    user: freshPayload
  };
}
