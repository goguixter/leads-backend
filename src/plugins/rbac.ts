import fp from "fastify-plugin";
import { ForbiddenError, UnauthorizedError } from "../shared/errors";
import { resolveTenantPartnerId } from "../shared/tenant";

export const rbacPlugin = fp(async (app) => {
  app.decorate("requireAuth", async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError("Token de acesso invalido ou expirado");
    }
  });

  app.decorate("requireMaster", async (request) => {
    if (request.user.role !== "MASTER") {
      throw new ForbiddenError("Apenas MASTER pode acessar esta rota");
    }
  });

  app.decorate("enforceTenant", (request, requestedPartnerId) => {
    return resolveTenantPartnerId(request, requestedPartnerId);
  });
});
