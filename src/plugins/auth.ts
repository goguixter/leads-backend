import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import { env } from "../shared/env";

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_ACCESS_SECRET
  });
});
