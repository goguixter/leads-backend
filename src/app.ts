import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { authRoutes } from "./modules/auth/routes";
import { importsRoutes } from "./modules/imports/routes";
import { leadsRoutes } from "./modules/leads/routes";
import { partnersRoutes } from "./modules/partners/routes";
import { usersRoutes } from "./modules/users/routes";
import { authPlugin } from "./plugins/auth";
import { prismaPlugin } from "./plugins/prisma";
import { rbacPlugin } from "./plugins/rbac";
import { AppError } from "./shared/errors";
import { env } from "./shared/env";

export function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== "test"
  });

  app.register(prismaPlugin);
  app.register(authPlugin);
  app.register(rbacPlugin);
  app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1
    }
  });

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString()
  }));

  app.register(authRoutes, { prefix: "/auth" });
  app.register(partnersRoutes, { prefix: "/partners" });
  app.register(usersRoutes, { prefix: "/users" });
  app.register(leadsRoutes, { prefix: "/leads" });
  app.register(importsRoutes, { prefix: "/imports" });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Erro de validacao",
          details: error.flatten()
        }
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null
        }
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply.status(409).send({
          success: false,
          error: {
            code: "CONFLICT",
            message: "Registro duplicado para um campo unico"
          }
        });
      }
    }

    app.log.error(error);
    return reply.status(500).send({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Erro interno do servidor"
      }
    });
  });

  return app;
}
