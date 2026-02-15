import { PrismaClient } from "@prisma/client";
import { FastifyReply } from "fastify";

declare module "fastify" {
  type AuthUser = {
    id: string;
    role: "MASTER" | "PARTNER";
    partnerId: string | null;
  };

  interface FastifyInstance {
    prisma: PrismaClient;
    requireAuth: (request: import("fastify").FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireMaster: (request: import("fastify").FastifyRequest, reply: FastifyReply) => Promise<void>;
    enforceTenant: (
      request: import("fastify").FastifyRequest,
      requestedPartnerId?: string | null
    ) => string | null;
  }

  interface FastifyRequest {
    user: AuthUser;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      id: string;
      role: "MASTER" | "PARTNER";
      partnerId: string | null;
    };
    user: {
      id: string;
      role: "MASTER" | "PARTNER";
      partnerId: string | null;
    };
  }
}
