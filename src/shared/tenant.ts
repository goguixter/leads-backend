import { FastifyRequest } from "fastify";
import { ForbiddenError } from "./errors";

export function resolveTenantPartnerId(
  request: FastifyRequest,
  requestedPartnerId?: string | null
): string | null {
  if (request.user.role === "MASTER") {
    return requestedPartnerId ?? null;
  }

  const authenticatedPartnerId = request.user.partnerId;
  if (!authenticatedPartnerId) {
    throw new ForbiddenError("Usuario PARTNER sem partner_id vinculado");
  }

  if (requestedPartnerId && requestedPartnerId !== authenticatedPartnerId) {
    throw new ForbiddenError("PARTNER nao pode acessar dados de outro partner");
  }

  return authenticatedPartnerId;
}
