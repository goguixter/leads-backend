export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Nao autorizado") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado") {
    super(403, "FORBIDDEN", message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Requisicao invalida", details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = "Entidade nao processavel", details?: unknown) {
    super(422, "UNPROCESSABLE_ENTITY", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso nao encontrado") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflito", details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}
