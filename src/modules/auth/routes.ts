import { FastifyInstance } from "fastify";
import { loginBodySchema, refreshBodySchema } from "./schemas";
import { login, refreshSession } from "./service";

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", async (request) => {
    const body = loginBodySchema.parse(request.body);
    return login(app, body.email, body.password);
  });

  app.post("/refresh", async (request) => {
    const body = refreshBodySchema.parse(request.body);
    return refreshSession(app, body.refreshToken);
  });

  app.post("/logout", async (_request, reply) => {
    return reply.status(204).send();
  });
}
