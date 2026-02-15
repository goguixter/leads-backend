import { buildApp } from "./app";
import { env } from "./shared/env";

async function start() {
  const app = buildApp();

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
