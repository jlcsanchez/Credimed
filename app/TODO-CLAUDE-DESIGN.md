# TODO: Claude Design — post-flow screens

Pantallas del monolito (`legacy-monolith.html`, ahora borrado) que aún no tienen
equivalente diseñado en Claude Design. Se necesitan cuando el paciente termina
el flow de claim submission.

## Orden sugerido

### 1. Dashboard post-flow (P0 — lo primero)
**URL:** `/app/dashboard.html`
**Cuándo se ve:** Después de `submission-confirmed`, click en "View my claim →".

**Contenido:**
- Hero con saludo personalizado (`Hi, {firstName}`)
- Estimated refund ($X – $Y)
- Claim progress stepper (4 steps):
  1. Upload ✓
  2. Processing ✓
  3. Review (current)
  4. Submit
- Claim status pill (Submitted / In review / Approved / Paid / Denied)
- Resumen del claim: Reference number (copy button), Dentist, Procedure, Amount paid, Plan
- Timeline: "What happens next" (within 24 h, 2–6 weeks, when approved)
- Bottom nav: Home / Support / Profile

**Datos que ya tiene disponibles (vía `CredimedState` + `authFetch('/claims')`):**
- `claim.id`, `claim.status`, `claim.submittedAt`, `claim.procedure`, `claim.city`
- `claim.paidAmount`, `claim.estimateMin`, `claim.estimateMax`
- `claim.plan` (standard / premium)
- `user.firstName`, `user.lastName`, `user.email` (de Cognito)

### 2. Profile (P1)
**URL:** `/app/profile.html`
**Cuándo se ve:** Bottom nav → Profile.

**Contenido:**
- Avatar + nombre completo + email
- Plan actual (Standard $29 / Premium $39)
- Payment method on file (last 4 tarjeta)
- Past claims (lista compacta con status)
- Settings: notifications, language, HIPAA data export request, delete account
- Sign out

### 3. Support / Ana chat (P1)
**URL:** `/app/support.html` (o dejar el widget flotante que ya existe en `ana.js`)
**Cuándo se ve:** Bottom nav → Support.

**Contenido:**
- Header: Ana avatar + "Usually replies in a few minutes"
- Lista de quick-reply chips (documents, timing, data security, talk to specialist)
- Message thread (Ana + user bubbles)
- Input + send button (o WhatsApp deep-link como fallback)
- Link a FAQ / knowledge base

### 4. Claims history / All claims (P2)
**URL:** `/app/claims.html`
**Cuándo se ve:** Desde Dashboard click en "See all claims" o desde Profile.

**Contenido:**
- Lista de claims pasados y activos
- Cada item: ref, procedure, amount, status pill, submitted date
- Filter: All / Active / Paid / Denied
- Empty state: "No completed claims yet"

### 5. Claim detail (P2)
**URL:** `/app/claim.html?id={claimId}` o `/app/claim/{claimId}.html`
**Cuándo se ve:** Click en un claim del dashboard o de claims history.

**Contenido:**
- Hero con claim ref + status
- Full timeline con eventos (submitted, insurer acknowledged, approved, paid)
- Documents uploaded (insurance card, receipt, supporting) con previews
- Financial breakdown
- Actions: Download PDF receipt, Resubmit (si denied), Contact specialist

## Flow reference (el que tenía el monolito)

```
landing (credimed.us)
  → login (Claude Design ✅)
  → documents (Claude Design ✅ + OCR Lambda fijo)
  → processing (Claude Design ✅)
  → estimate (Claude Design ✅)
  → plan (Claude Design ✅)
  → before-sign (Claude Design ✅)
  → agreement (Claude Design ✅ v1.1)
  → payment (Claude Design ✅ Stripe)
  → submission-confirmed (Claude Design ✅)
  → dashboard (🔴 FALTA diseñar)
    ├─ profile (🔴 FALTA)
    ├─ support / Ana (🟡 widget flotante existe, pantalla full no)
    ├─ claims history (🔴 FALTA)
    └─ claim detail (🔴 FALTA)
```

## Backend endpoints disponibles (ya desplegados en AWS us-west-2)

- `POST /ocr` — OCR de insurance card y receipt (Bedrock Claude Haiku)
- `POST /claims` — guardar un claim nuevo
- `GET /claims` — listar claims del usuario logueado (JWT)
- `GET /claims?admin=1` — listar todos (solo admin)
- `POST /claims` con `{ action: 'update_status', claimId, status }` — admin cambia status
- `POST https://vhimqtp4oxicnyv6yarj2kpipe0sjfto.lambda-url.us-west-2.on.aws/` — Stripe payment intents

## Admin tool

- `/app/admin.html` — operations panel (claims table + status updater). Independiente, no necesita rediseño.
