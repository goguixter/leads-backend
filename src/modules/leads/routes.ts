import { LeadStatus } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors";
import { env } from "../../shared/env";
import { normalizeFromCountryAndNational } from "../../shared/phone";

const leadIdParamsSchema = z.object({
  id: z.string().uuid()
});

const createLeadBodySchema = z.object({
  partner_id: z.string().uuid().optional(),
  student_name: z.string().min(2).max(160),
  email: z.string().email(),
  phone_country: z.string().length(2),
  phone_national: z.string().min(6).max(30),
  school: z.string().min(2).max(160),
  city: z.string().min(2).max(120)
});

const listLeadsQuerySchema = z.object({
  partner_id: z.string().uuid().optional(),
  status: z.enum(["NEW", "FIRST_CONTACT", "RESPONDED", "NO_RESPONSE", "WON", "LOST"]).optional(),
  school: z.string().optional(),
  city: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20)
});

const updateLeadBodySchema = z
  .object({
    student_name: z.string().min(2).max(160).optional(),
    email: z.string().email().optional(),
    phone_country: z.string().length(2).optional(),
    phone_national: z.string().min(6).max(30).optional(),
    school: z.string().min(2).max(160).optional(),
    city: z.string().min(2).max(120).optional(),
    status: z.enum(["NEW", "FIRST_CONTACT", "RESPONDED", "NO_RESPONSE", "WON", "LOST"]).optional(),
    note: z.string().max(1000).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar"
  });

function buildLeadWhere(
  partnerId: string | null,
  query: z.infer<typeof listLeadsQuerySchema>
): {
  partnerId?: string;
  status?: LeadStatus;
  school?: { contains: string; mode: "insensitive" };
  city?: { contains: string; mode: "insensitive" };
  OR?: Array<
    | { studentName: { contains: string; mode: "insensitive" } }
    | { email: { contains: string; mode: "insensitive" } }
    | { phoneE164: { contains: string; mode: "insensitive" } }
  >;
} {
  const where: ReturnType<typeof buildLeadWhere> = {};

  if (partnerId) where.partnerId = partnerId;
  if (query.status) where.status = query.status as LeadStatus;
  if (query.school) where.school = { contains: query.school, mode: "insensitive" };
  if (query.city) where.city = { contains: query.city, mode: "insensitive" };
  if (query.search) {
    where.OR = [
      { studentName: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { phoneE164: { contains: query.search, mode: "insensitive" } }
    ];
  }

  return where;
}

export async function leadsRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const body = createLeadBodySchema.parse(request.body);
    const requestedPartnerId = request.user.role === "MASTER" ? env.DEFAULT_PARTNER_ID : body.partner_id;
    const partnerId = app.enforceTenant(request, requestedPartnerId);
    if (!partnerId) {
      throw new BadRequestError("DEFAULT_PARTNER_ID obrigatorio para criar lead como MASTER");
    }

    const phone = normalizeFromCountryAndNational(body.phone_country, body.phone_national);

    const lead = await app.prisma.lead.create({
      data: {
        partnerId,
        createdByUserId: request.user.id,
        studentName: body.student_name,
        email: body.email,
        phoneRaw: phone.phoneRaw,
        phoneE164: phone.phoneE164,
        phoneCountry: phone.phoneCountry,
        phoneValid: phone.phoneValid,
        school: body.school,
        city: body.city
      }
    });

    return reply.status(201).send(lead);
  });

  app.get("/", { preHandler: [app.requireAuth] }, async (request) => {
    const query = listLeadsQuerySchema.parse(request.query);
    const partnerId = app.enforceTenant(request, query.partner_id);
    const where = buildLeadWhere(partnerId, query);
    const skip = (query.page - 1) * query.page_size;

    const [items, total] = await app.prisma.$transaction([
      app.prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.page_size
      }),
      app.prisma.lead.count({ where })
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        page_size: query.page_size,
        total
      }
    };
  });

  app.get("/:id", { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = leadIdParamsSchema.parse(request.params);
    const lead = await app.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundError("Lead nao encontrado");
    }

    app.enforceTenant(request, lead.partnerId);
    return lead;
  });

  app.get("/:id/history", { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = leadIdParamsSchema.parse(request.params);
    const lead = await app.prisma.lead.findUnique({
      where: { id },
      select: { id: true, partnerId: true }
    });
    if (!lead) {
      throw new NotFoundError("Lead nao encontrado");
    }
    app.enforceTenant(request, lead.partnerId);

    const [statusHistory, contactEvents] = await app.prisma.$transaction([
      app.prisma.leadStatusHistory.findMany({
        where: { leadId: id },
        orderBy: { createdAt: "desc" },
        include: {
          changedByUser: {
            select: { id: true, name: true, email: true }
          }
        }
      }),
      app.prisma.contactEvent.findMany({
        where: { leadId: id },
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      })
    ]);

    return {
      lead_id: id,
      status_history: statusHistory,
      contact_events: contactEvents
    };
  });

  app.patch("/:id", { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = leadIdParamsSchema.parse(request.params);
    const body = updateLeadBodySchema.parse(request.body);

    const lead = await app.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundError("Lead nao encontrado");
    }
    app.enforceTenant(request, lead.partnerId);
    if (body.status && request.user.role !== "MASTER") {
      throw new ForbiddenError("Apenas MASTER pode alterar status do lead");
    }

    const nextPhoneCountry = body.phone_country ?? lead.phoneCountry;
    const nextPhoneNational = body.phone_national ?? lead.phoneRaw;
    let phonePatch:
      | {
          phoneRaw: string;
          phoneE164: string;
          phoneCountry: string;
          phoneValid: boolean;
        }
      | undefined;

    if (body.phone_country || body.phone_national) {
      phonePatch = normalizeFromCountryAndNational(nextPhoneCountry, nextPhoneNational);
    }

    const nextStatus = (body.status as LeadStatus | undefined) ?? lead.status;

    const updated = await app.prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id },
        data: {
          studentName: body.student_name,
          email: body.email,
          school: body.school,
          city: body.city,
          status: body.status as LeadStatus | undefined,
          phoneRaw: phonePatch?.phoneRaw,
          phoneE164: phonePatch?.phoneE164,
          phoneCountry: phonePatch?.phoneCountry,
          phoneValid: phonePatch?.phoneValid
        }
      });

      if (body.status && body.status !== lead.status) {
        await tx.leadStatusHistory.create({
          data: {
            leadId: lead.id,
            oldStatus: lead.status,
            newStatus: nextStatus,
            changedByUserId: request.user.id,
            note: body.note
          }
        });
      }

      return result;
    });

    return updated;
  });

  app.post("/:id/generate-message", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const { id } = leadIdParamsSchema.parse(request.params);
    const lead = await app.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundError("Lead nao encontrado");
    }
    app.enforceTenant(request, lead.partnerId);

    const firstName = lead.studentName.trim().split(" ")[0] || lead.studentName;
    const message =
      `Ola, ${firstName}! Somos especialistas em passagens para intercambio. ` +
      `Vimos seu interesse em ${lead.school}, em ${lead.city}. Posso te ajudar com as melhores opcoes de voo?`;

    if (!lead.phoneValid) {
      await app.prisma.contactEvent.create({
        data: {
          leadId: lead.id,
          userId: request.user.id,
          channel: "WHATSAPP",
          messageTemplateVersion: "v1",
          messageRendered: message,
          toAddress: lead.phoneE164,
          success: false,
          errorReason: "phone_valid=false"
        }
      });

      return reply.status(422).send({
        success: false,
        error: {
          code: "INVALID_PHONE",
          message: "Lead com telefone invalido"
        }
      });
    }

    const now = new Date();
    const updatedLead = await app.prisma.$transaction(async (tx) => {
      await tx.contactEvent.create({
        data: {
          leadId: lead.id,
          userId: request.user.id,
          channel: "WHATSAPP",
          messageTemplateVersion: "v1",
          messageRendered: message,
          toAddress: lead.phoneE164,
          success: true
        }
      });

      const patch: {
        firstContactedAt?: Date;
        lastContactedAt: Date;
        status?: LeadStatus;
      } = {
        lastContactedAt: now
      };

      if (!lead.firstContactedAt) {
        patch.firstContactedAt = now;
      }

      if (lead.status === "NEW" && request.user.role === "MASTER") {
        patch.status = "FIRST_CONTACT";
      }

      const result = await tx.lead.update({
        where: { id: lead.id },
        data: patch
      });

      if (lead.status === "NEW") {
        if (request.user.role !== "MASTER") {
          return result;
        }

        await tx.leadStatusHistory.create({
          data: {
            leadId: lead.id,
            oldStatus: "NEW",
            newStatus: "FIRST_CONTACT",
            changedByUserId: request.user.id,
            note: "Status alterado na primeira geracao de mensagem"
          }
        });
      }

      return result;
    });

    return {
      lead: updatedLead,
      template_version: "v1",
      channel: "WHATSAPP",
      to_address: lead.phoneE164,
      message
    };
  });
}
