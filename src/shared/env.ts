import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().default(3333),
  CORS_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL obrigatoria"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET obrigatoria"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET obrigatoria"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d")
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Variaveis de ambiente invalidas", result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
