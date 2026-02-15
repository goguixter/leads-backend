import { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError } from "../../shared/errors";

const createPartnerBodySchema = z.object({
  name: z.string().min(2).max(120)
});

const updatePartnerBodySchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    is_active: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar"
  });

const partnerParamsSchema = z.object({
  id: z.string().uuid()
});

export async function partnersRoutes(app: FastifyInstance) {
  app.post(
    "/",
    { preHandler: [app.requireAuth, app.requireMaster] },
    async (request, reply) => {
      const body = createPartnerBodySchema.parse(request.body);

      const partner = await app.prisma.partner.create({
        data: { name: body.name },
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true
        }
      });

      return reply.status(201).send(partner);
    }
  );

  app.get("/", { preHandler: [app.requireAuth, app.requireMaster] }, async () => {
    return app.prisma.partner.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });
  });

  app.patch(
    "/:id",
    { preHandler: [app.requireAuth, app.requireMaster] },
    async (request) => {
      const { id } = partnerParamsSchema.parse(request.params);
      const body = updatePartnerBodySchema.parse(request.body);

      const existing = await app.prisma.partner.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        throw new NotFoundError("Partner nao encontrado");
      }

      return app.prisma.partner.update({
        where: { id },
        data: {
          name: body.name,
          isActive: body.is_active
        },
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true
        }
      });
    }
  );
}
