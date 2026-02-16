import { ImportStatus } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as XLSX from "xlsx";
import { BadRequestError, NotFoundError } from "../../shared/errors";
import { env } from "../../shared/env";
import { normalizeFromInternational } from "../../shared/phone";

const importIdParamsSchema = z.object({
  id: z.string().uuid()
});

const confirmImportBodySchema = z.object({
  ignore_duplicates: z.boolean().default(true)
});

const previewRowSchema = z.object({
  student_name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(4),
  school: z.string().min(2),
  city: z.string().min(2)
});

type RawImportRow = {
  student_name: string;
  email: string;
  phone: string;
  school: string;
  city: string;
};

type DuplicateReason = "phone" | "email" | "name";

async function findLeadDuplicate(
  app: FastifyInstance,
  partnerId: string,
  row: RawImportRow,
  normalizedPhoneE164: string
) {
  const duplicate = await app.prisma.lead.findFirst({
    where: {
      partnerId,
      OR: [
        { email: { equals: row.email, mode: "insensitive" } },
        { phoneE164: normalizedPhoneE164 },
        { studentName: { equals: row.student_name, mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      studentName: true,
      email: true,
      phoneE164: true
    }
  });

  if (!duplicate) {
    return null;
  }

  const reasons: DuplicateReason[] = [];
  if (duplicate.phoneE164 === normalizedPhoneE164) reasons.push("phone");
  if (duplicate.email.toLowerCase() === row.email.toLowerCase()) reasons.push("email");
  if (duplicate.studentName.toLowerCase() === row.student_name.toLowerCase()) reasons.push("name");

  return {
    duplicate,
    reasons
  };
}

function pickString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getFieldValue(fields: unknown, key: string) {
  const map = fields as Record<string, { value?: unknown } | Array<{ value?: unknown }> | undefined>;
  const raw = map[key];
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw[0]?.value ? String(raw[0].value) : undefined;
  return raw.value ? String(raw.value) : undefined;
}

export async function importsRoutes(app: FastifyInstance) {
  app.post("/xls/preview", { preHandler: [app.requireAuth] }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw new BadRequestError("Arquivo xls/xlsx e obrigatorio");
    }

    const filename = file.filename.toLowerCase();
    if (!filename.endsWith(".xls") && !filename.endsWith(".xlsx")) {
      throw new BadRequestError("Formato invalido. Use .xls ou .xlsx");
    }

    const requestedPartnerId =
      request.user.role === "MASTER" ? env.DEFAULT_PARTNER_ID : getFieldValue(file.fields, "partner_id");
    const partnerId = app.enforceTenant(request, requestedPartnerId);
    if (!partnerId) {
      throw new BadRequestError("DEFAULT_PARTNER_ID obrigatorio para importar como MASTER");
    }

    const buffer = await file.toBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestError("Planilha vazia");
    }
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      throw new BadRequestError("Aba principal da planilha nao encontrada");
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: ""
    });

    const requiredColumns = ["student_name", "email", "phone", "school", "city"];
    const headerSet = new Set(Object.keys(rows[0] ?? {}));
    const missingColumns = requiredColumns.filter((column) => !headerSet.has(column));
    if (missingColumns.length > 0) {
      throw new BadRequestError("Colunas obrigatorias ausentes", { missing_columns: missingColumns });
    }

    const parsedRows: RawImportRow[] = rows.map((row) => ({
      student_name: pickString(row.student_name),
      email: pickString(row.email),
      phone: pickString(row.phone),
      school: pickString(row.school),
      city: pickString(row.city)
    }));

    const errorsSample: Array<{ row_number: number; error: string }> = [];
    const previewRows: Array<
      RawImportRow & {
        row_number: number;
        is_duplicate: boolean;
        duplicate_fields: DuplicateReason[];
        error: string | null;
      }
    > = [];
    let validRows = 0;
    let duplicateRows = 0;
    const rowsToInsert: Array<{
      rowNumber: number;
      rawData: RawImportRow;
      normalizedPhoneE164: string | null;
      success: boolean;
      errorMessage: string | null;
    }> = [];

    for (const [index, row] of parsedRows.entries()) {
      const rowNumber = index + 2;
      let success = true;
      let errorMessage: string | null = null;
      let normalizedPhoneE164: string | null = null;
      let duplicateFields: DuplicateReason[] = [];

      const parsed = previewRowSchema.safeParse(row);
      if (!parsed.success) {
        success = false;
        errorMessage = "Campos invalidos na linha";
      } else if (!row.phone.startsWith("+")) {
        success = false;
        errorMessage = "Telefone deve iniciar com +";
      } else {
        try {
          normalizedPhoneE164 = normalizeFromInternational(row.phone).phoneE164;
          const duplicate = await findLeadDuplicate(app, partnerId, row, normalizedPhoneE164);
          if (duplicate) {
            success = false;
            duplicateRows += 1;
            duplicateFields = duplicate.reasons;
            const reasonLabel = duplicate.reasons
              .map((reason) => {
                if (reason === "phone") return "telefone";
                if (reason === "email") return "email";
                return "nome";
              })
              .join(", ");
            errorMessage = `DUPLICATE_LEAD: lead ja existe (${reasonLabel})`;
          }
        } catch {
          success = false;
          errorMessage = "Telefone invalido";
        }
      }

      if (success) {
        validRows += 1;
      } else if (errorsSample.length < 10 && errorMessage) {
        errorsSample.push({ row_number: rowNumber, error: errorMessage });
      }

      rowsToInsert.push({
        rowNumber,
        rawData: row,
        normalizedPhoneE164,
        success,
        errorMessage
      });

      previewRows.push({
        row_number: rowNumber,
        ...row,
        is_duplicate: duplicateFields.length > 0,
        duplicate_fields: duplicateFields,
        error: errorMessage
      });
    }

    const totalRows = rowsToInsert.length;
    const invalidRows = totalRows - validRows;

    const importBatch = await app.prisma.importBatch.create({
      data: {
        partnerId,
        uploadedByUserId: request.user.id,
        filename: file.filename,
        totalRows,
        successRows: 0,
        errorRows: 0,
        status: "DRAFT"
      }
    });

    if (rowsToInsert.length > 0) {
      await app.prisma.importRow.createMany({
        data: rowsToInsert.map((row) => ({
          importId: importBatch.id,
          rowNumber: row.rowNumber,
          rawData: row.rawData,
          normalizedPhoneE164: row.normalizedPhoneE164,
          success: row.success,
          errorMessage: row.errorMessage
        }))
      });
    }

    return reply.send({
      import_id: importBatch.id,
      total_rows: totalRows,
      valid_rows: validRows,
      invalid_rows: invalidRows,
      duplicate_rows: duplicateRows,
      preview_sample: parsedRows,
      preview_rows: previewRows,
      errors_sample: errorsSample
    });
  });

  app.post("/:id/confirm", { preHandler: [app.requireAuth] }, async (request) => {
    const body = confirmImportBodySchema.parse(request.body ?? {});
    const { id } = importIdParamsSchema.parse(request.params);
    const importBatch = await app.prisma.importBatch.findUnique({
      where: { id },
      include: {
        rows: true
      }
    });

    if (!importBatch) {
      throw new NotFoundError("Importacao nao encontrada");
    }

    app.enforceTenant(request, importBatch.partnerId);
    if (importBatch.status !== "DRAFT") {
      throw new BadRequestError("Apenas importacoes DRAFT podem ser confirmadas");
    }

    await app.prisma.importBatch.update({
      where: { id: importBatch.id },
      data: { status: "PROCESSING" }
    });

    const hasDuplicateRows = importBatch.rows.some(
      (row) => row.errorMessage?.startsWith("DUPLICATE_LEAD:") ?? false
    );
    if (hasDuplicateRows && !body.ignore_duplicates) {
      throw new BadRequestError(
        "Existem leads duplicados no preview. Marque para ignorar duplicados antes de confirmar."
      );
    }

    let createdCount = 0;
    let failedCount = 0;

    for (const row of importBatch.rows) {
      if (!row.success || !row.normalizedPhoneE164) {
        failedCount += 1;
        continue;
      }

      const raw = row.rawData as Record<string, unknown>;

      try {
        const phone = normalizeFromInternational(row.normalizedPhoneE164);
        const lead = await app.prisma.lead.create({
          data: {
            partnerId: importBatch.partnerId,
            createdByUserId: request.user.id,
            studentName: pickString(raw.student_name),
            email: pickString(raw.email),
            phoneRaw: pickString(raw.phone),
            phoneE164: phone.phoneE164,
            phoneCountry: phone.phoneCountry,
            phoneValid: true,
            school: pickString(raw.school),
            city: pickString(raw.city)
          }
        });

        await app.prisma.importRow.update({
          where: { id: row.id },
          data: {
            leadId: lead.id,
            success: true,
            errorMessage: null
          }
        });
        createdCount += 1;
      } catch (error) {
        await app.prisma.importRow.update({
          where: { id: row.id },
          data: {
            success: false,
            errorMessage: error instanceof Error ? error.message : "Erro ao criar lead"
          }
        });
        failedCount += 1;
      }
    }

    const totalRows = importBatch.rows.length;
    const finalStatus: ImportStatus = failedCount === totalRows ? "FAILED" : "DONE";

    const updatedImport = await app.prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        status: finalStatus,
        totalRows,
        successRows: createdCount,
        errorRows: failedCount
      }
    });

    return {
      import_id: updatedImport.id,
      status: updatedImport.status,
      total_rows: updatedImport.totalRows,
      success_rows: updatedImport.successRows,
      error_rows: updatedImport.errorRows
    };
  });

  app.post("/:id/cancel", { preHandler: [app.requireAuth] }, async (request) => {
    const { id } = importIdParamsSchema.parse(request.params);
    const importBatch = await app.prisma.importBatch.findUnique({
      where: { id }
    });

    if (!importBatch) {
      throw new NotFoundError("Importacao nao encontrada");
    }

    app.enforceTenant(request, importBatch.partnerId);
    if (importBatch.status === "DONE" || importBatch.status === "FAILED") {
      throw new BadRequestError("Nao e possivel cancelar importacao finalizada");
    }

    return app.prisma.importBatch.update({
      where: { id },
      data: { status: "CANCELED" }
    });
  });
}
