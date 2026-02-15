import { hash } from "bcryptjs";
import { FastifyInstance } from "fastify";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { BadRequestError } from "../../shared/errors";

const createUserBodySchema = z.object({
  role: z.enum(["MASTER", "PARTNER"]),
  partner_id: z.string().uuid().nullable().optional(),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(6),
  is_active: z.boolean().optional()
});

const listUsersQuerySchema = z.object({
  partner_id: z.string().uuid().optional()
});

export async function usersRoutes(app: FastifyInstance) {
  app.post(
    "/",
    { preHandler: [app.requireAuth, app.requireMaster] },
    async (request, reply) => {
      const body = createUserBodySchema.parse(request.body);

      if (body.role === "PARTNER" && !body.partner_id) {
        throw new BadRequestError("partner_id e obrigatorio para usuario PARTNER");
      }

      if (body.role === "MASTER" && body.partner_id) {
        throw new BadRequestError("Usuario MASTER nao pode ter partner_id");
      }

      const passwordHash = await hash(body.password, 10);
      const user = await app.prisma.user.create({
        data: {
          role: body.role as UserRole,
          partnerId: body.role === "PARTNER" ? body.partner_id : null,
          name: body.name,
          email: body.email,
          passwordHash,
          isActive: body.is_active ?? true
        },
        select: {
          id: true,
          role: true,
          partnerId: true,
          name: true,
          email: true,
          isActive: true,
          createdAt: true
        }
      });

      return reply.status(201).send(user);
    }
  );

  app.get(
    "/",
    { preHandler: [app.requireAuth, app.requireMaster] },
    async (request) => {
      const query = listUsersQuerySchema.parse(request.query);

      return app.prisma.user.findMany({
        where: {
          partnerId: query.partner_id
        },
        select: {
          id: true,
          role: true,
          partnerId: true,
          name: true,
          email: true,
          isActive: true,
          createdAt: true
        },
        orderBy: { createdAt: "desc" }
      });
    }
  );
}
