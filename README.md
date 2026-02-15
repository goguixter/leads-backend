# CRM Leve Backend

Backend multi-tenant com Node.js + TypeScript, Fastify, Prisma ORM e PostgreSQL (Railway).

## Stack
- Node.js + TypeScript
- Fastify
- Prisma ORM
- PostgreSQL (Railway)
- Zod
- JWT (access + refresh)

## Estrutura
```txt
src/
  app.ts
  server.ts
  plugins/
    auth.ts
    prisma.ts
    rbac.ts
  modules/
    auth/
    partners/
    users/
    leads/
    imports/
  shared/
    env.ts
    errors.ts
    phone.ts
    schemas.ts
    tenant.ts
    utils.ts
```

## Variáveis de ambiente
```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3333
CORS_ORIGIN="*"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
JWT_ACCESS_SECRET="change-me-access"
JWT_REFRESH_SECRET="change-me-refresh"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"
```

## Como rodar local
1. `npm install`
2. Criar `.env` com as variáveis acima.
3. `npm run prisma:generate`
4. `npm run prisma:migrate`
5. `npm run dev`

Produção:
1. `npm run build`
2. `npx prisma migrate deploy && npm run start`

## Auth / RBAC / Tenant
- `requireAuth`: exige JWT válido.
- `requireMaster`: exige `request.user.role === MASTER`.
- `enforceTenant`: se `PARTNER`, força `partner_id` do próprio usuário.

Regras:
- `MASTER`: acesso total.
- `PARTNER`: acesso apenas aos dados do próprio `partner_id`.
- `PARTNER` não cria usuário `MASTER` (rotas de usuários são exclusivas de `MASTER`).

## Endpoints

### Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout` (stateless, 204)

### Partners (MASTER)
- `POST /partners`
- `GET /partners`
- `PATCH /partners/:id`

### Users (MASTER)
- `POST /users`
- `GET /users?partner_id=<uuid>`

### Leads
- `POST /leads`
- `GET /leads`
- `GET /leads/:id`
- `GET /leads/:id/history`
- `PATCH /leads/:id`
- `POST /leads/:id/generate-message`

### Imports
- `POST /imports/xls/preview`
- `POST /imports/:id/confirm`
- `POST /imports/:id/cancel`

## Exemplos cURL

### 1) Login
```bash
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"master@crm.com","password":"123456"}'
```

### 2) Criar lead manual
```bash
curl -X POST http://localhost:3333/leads \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "partner_id":"<PARTNER_UUID>",
    "student_name":"Ana Souza",
    "email":"ana@email.com",
    "phone_country":"BR",
    "phone_national":"11988887777",
    "school":"Toronto School",
    "city":"Toronto"
  }'
```

### 3) Preview do import XLS/XLSX
```bash
curl -X POST http://localhost:3333/imports/xls/preview \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "partner_id=<PARTNER_UUID>" \
  -F "file=@/caminho/arquivo.xlsx"
```

### 4) Confirmar import
```bash
curl -X POST http://localhost:3333/imports/<IMPORT_ID>/confirm \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### 5) Gerar mensagem
```bash
curl -X POST http://localhost:3333/leads/<LEAD_ID>/generate-message \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## Migrações
- Arquivo inicial: `prisma/migrations/20260215134000_init/migration.sql`
- Schema: `prisma/schema.prisma`
