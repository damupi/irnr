# AGENTS.md — IRNR

Guía para cualquier agente (Claude, Sonnet, Codex…) que trabaje en este repo. Léela entera antes de tocar código.
Documentos de trabajo **privados** (no versionados, carpeta `private/` en `.gitignore`): `PRD.md` (qué y por qué), `PLAN.md` (pasos de ejecución) y `STATUS.md` (log de progreso). Si existen en tu copia local, léelos; si no, esta guía y el código bastan.

## Estado y log de progreso

**Mantén `private/STATUS.md` al día** (carpeta local no versionada): léelo al empezar una sesión, si existe, y añade una línea fechada al log cada vez que completes un paso relevante (fase iniciada/terminada, decisión, bloqueo, duda). Actualiza también el encabezado "Fase actual". Ese log contiene datos reales del propietario: **nunca lo copies al repo** ni a nada publicable. Requisitos y plan: `private/PRD.md` y `private/PLAN.md`.

## Qué es

App **local** (un solo usuario, sin auth, sin despliegue) para llevar la contabilidad de un inmueble situado en España propiedad de un **no residente fiscal en España, residente en otro país de la UE/EEE**, y calcular el **Modelo 210 del IRNR** (Impuesto sobre la Renta de No Residentes):

- **Ledger** de ingresos y gastos del inmueble con adjuntos (facturas, recibos), categorizado con `cat1` / `cat2`.
- **Motor fiscal** que, a partir del ledger, calcula por ejercicio:
  - rendimientos del alquiler (tipo de renta 01) con el *Anexo de desglose de gastos deducibles* (casillas 1–17, Orden HAC/623/2026);
  - renta imputada (tipo de renta 02) por los días no alquilados.
- **Dashboard** con resumen, alertas y estado de cada ejercicio.
- Fase 2 (NO ahora): módulo de hipoteca con cuadro de amortización.

Idioma de la UI y del dominio: **español**. Formato de números y fechas `es-ES` (`1.234,56 €`, `dd/mm/aaaa`). El código (identificadores) puede ir en inglés o español, pero sé consistente: **entidades de dominio en español** (`movimiento`, `casilla`, `ejercicio`) solo en textos de UI; en código usa inglés (`transaction`, `box`, `taxYear`).

## Metodología obligatoria: TDD

El propietario exige **TDD estricto**:

1. Escribe el test → ejecútalo → **debe fallar** (rojo). Si no falla, el test no vale.
2. Implementa lo mínimo para pasarlo (verde).
3. Refactoriza con los tests en verde.
4. No se fusiona ni se da por terminada una tarea con tests en rojo, saltados (`.skip`) o borrados para "pasar".

Capas de test:

| Capa | Herramienta | Dónde |
|---|---|---|
| Motor fiscal (funciones puras) | Vitest | `src/lib/tax/*.test.ts` — **100 % de ramas** |
| Datos (repos, server actions, import, adjuntos) | Vitest + SQLite `:memory:` + migraciones Drizzle; adjuntos en `os.tmpdir()` | `src/**/*.test.ts`, `scripts/*.test.ts` |
| UI end-to-end | Playwright contra `next dev` con BD de test sembrada | `e2e/*.spec.ts` |

Los tests **nunca** llaman a Google (`gws`) ni a red. El import se testea con fixtures JSON en `scripts/fixtures/`.

## Arquitectura

```
Next.js 15 (App Router, TypeScript, server components + server actions)
 ├─ UI: Tailwind v4 + shadcn/ui + Recharts + lucide-react
 ├─ src/lib/tax/        motor fiscal PURO (sin I/O, sin fechas "now" implícitas)
 ├─ src/db/             Drizzle ORM + better-sqlite3 → data/irnr.db
 ├─ src/server/         repositorios + server actions (única capa que toca la BD)
 ├─ src/app/api/attachments/[id]/route.ts   sirve ficheros de data/attachments/
 └─ scripts/            seed.ts, import-sheet.ts (lee Google Sheet vía CLI gws)
```

Flujo: **UI → server action → repositorio (Drizzle) → SQLite**. Para cálculos: el repositorio carga los datos del ejercicio y los pasa a `computeTaxYear()` (puro) → resultado serializable → UI.

### Estructura de carpetas

```
irnr/
  AGENTS.md  CLAUDE.md  README.md
  private/                   # GITIGNORED: PRD.md, PLAN.md, STATUS.md, import.env (datos y notas personales)
  data/                      # GITIGNORED salvo irnr.db.example (BD demo): irnr.db, attachments/<año>/<uuid>-<nombre>
  drizzle/                   # migraciones generadas por drizzle-kit
  e2e/                       # specs Playwright
  scripts/
    seed.ts                  # categorías + inmueble + contrato + declaraciones presentadas
    import-sheet.ts          # import idempotente desde la Google Sheet
    import-sheet.test.ts
    fixtures/                # JSON de la sheet para tests
  src/
    app/
      layout.tsx             # sidebar con el menú
      page.tsx               # Dashboard
      movimientos/page.tsx
      declaracion/[year]/page.tsx
      configuracion/page.tsx
      guia/page.tsx
      api/attachments/[id]/route.ts
    components/              # ledger-table, transaction-form, attachment-dropzone, kpi-card, charts/…
    db/schema.ts  db/client.ts  db/test-utils.ts
    lib/money.ts             # céntimos <-> "1.234,56 €", parseo de importes es-ES
    lib/dates.ts             # parseo d/mm/yyyy, días entre fechas, años bisiestos
    lib/tax/                 # days.ts amortization.ts carryforward.ts deadlines.ts modelo210.ts + tests
    server/                  # transactions.ts attachments.ts properties.ts rentals.ts filings.ts categories.ts
```

### Modelo de datos (SQLite)

- `properties`: alias, dirección, `cadastral_ref`, `acquisition_date`, `ownership_pct` (100), `residence_country` (por defecto 'DE'), `tax_rate_pct` (19).
- `property_year_params`: `property_id`, `year`, `cadastral_land_cents`, `cadastral_building_cents`, `imputation_rate_pct` (2.0), `initial_carryforward_cents` (manual, años previos a la app), `deadline_override_*` (nullable), `days_imputed_override` (nullable).
- `categories`: `cat1`, `cat2`, `treatment` (enum, ver abajo), `box` (casilla 1–16 del anexo o null), `prorate` (bool), `help` (texto).
- `transactions`: `date` (ISO), `kind` ('expense'|'income'), `amount_cents` (entero > 0), `payee`, `concept`, `category_id` (nullable = pendiente), `has_invoice` (bool, antigua columna "Taxes"), `frequency` ('unica'|'mensual'|'trimestral'|'anual'), `allocation_pct` (100 por defecto), `tax_year_override` (nullable), `notes`, `source` ('manual'|'import'), `external_key` (para idempotencia del import), timestamps.
- `attachments`: `transaction_id` | `rental_period_id` | `filing_id` (uno de ellos), `filename`, `path` (relativo a `data/attachments`), `mime`, `size`, `sha256`, `created_at`.
- `rental_periods`: `property_id`, `tenant`, `start_date`, `end_date` (nullable = vigente), `monthly_rent_cents`, `agency`, `notes`.
- `filings`: `year`, `income_type` ('01'|'02'), `filed_at`, `receipt_number`, `gross_cents`, `expenses_cents`, `base_cents`, `tax_cents`, `notes`.

`treatment` enum: `income` (computa en rendimientos íntegros), `non_taxable_income` (fianza), `capped_1_4` (intereses/financiación/reparación: límite conjunto), `deductible` (casillas 5–12, 16), `acquisition_cost` (base de amortización del inmueble, casilla 14), `furniture_10` (casilla 13), `improvement_3` (casilla 15), `non_deductible`.

## Reglas fiscales (resumen; fuentes oficiales enlazadas en la página Guía de la app)

- Residente UE/EEE → tipo **19 %** y puede deducir gastos (art. 24.6 TRLIRNR → reglas IRPF art. 23 LIRPF, arts. 13–14 RIRPF). Sin reducción del 60 %.
- **Límite conjunto casillas 2+4** (intereses/financiación + reparación/conservación) ≤ rendimientos íntegros; exceso se arrastra **4 años**, FIFO (lo más antiguo primero).
- Amortización inmueble: **3 % × max(coste de adquisición, valor catastral total) × (VC construcción / VC total)**, prorrateada por días alquilados.
- Muebles/electrodomésticos: **10 %** anual del coste; mejoras: **3 %**. Prorrateo por días alquilados y tope acumulado = coste.
- Gastos con `prorate=true` (IBI, comunidad, seguros, intereses, suministros) × días alquilados / días del año. Resto al 100 % (`allocation_pct` permite ajustar).
- Todo × `ownership_pct`.
- Base mínima 0. Cuota = base × tipo.
- Renta imputada: VC total × 2 % (o 1,1 %) × días no alquilados (desde la adquisición) / días del año. Sin gastos.
- Capital de la hipoteca amortizado (ordinario o anticipado) → **no deducible**. Intereses pagados y comisión de amortización anticipada → `capped_1_4`.
- **Redondeo**: trabaja en céntimos; suma los céntimos crudos por casilla, aplica prorrateos/porcentajes en coma flotante y **redondea una sola vez por casilla** (`Math.round`, half-up). La cuota se redondea al céntimo sobre la base ya redondeada.

## Comandos

```bash
npm run dev          # http://localhost:3000
npm test             # vitest run (unit + integración)
npm run test:watch
npm run test:e2e     # playwright
npm run db:generate  # drizzle-kit generate (tras cambiar schema.ts)
npm run db:migrate   # aplica migraciones a data/irnr.db
npm run seed         # categorías, inmueble, contrato, declaraciones presentadas
npm run import       # import real desde la Google Sheet (requiere gws autenticado)
npm run lint && npx tsc --noEmit
```

### Particularidades del entorno

- La caché global de npm (`~/.npm`) tiene ficheros de root → `EACCES`. El repo incluye `.npmrc` con `cache=./.npm-cache` (gitignored). **No uses sudo**.
- Google (solo para el import opcional): CLI `gws`. Si usas varias cuentas, fija `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` a la config de la cuenta correcta; con la equivocada da 401.
- Node 24, npm, macOS. `better-sqlite3` es nativo: si falla el build, `npm rebuild better-sqlite3`.

## Fuentes de datos externas

- Import opcional (`npm run import`): una Google Sheet con el ledger histórico (pestaña de gastos —`IRNR_SHEET_TAB_EXPENSES`, por defecto `Gastos`—, `Cuadro de Amortizacion`, `IBI`, cabecera `Fecha | PVP | Beneficiario | Concepto | Categoria1 | Categoria2 | Taxes | Frecuencia`) y carpetas de Drive con PDFs. Los identificadores **no** están en el repo: se pasan por entorno (`IRNR_SHEET_ID`, `IRNR_DRIVE_FOLDER_MAIN`, `IRNR_DRIVE_FOLDER_TAXES`, `IRNR_SHEET_TAB_EXPENSES`; ver README). El propietario los guarda en `private/import.env`.
- Leer solo. **Nunca escribir en la sheet ni en Drive.** Los PDFs escaneados no tienen texto: para leerlos, `pdftoppm -png` y ver las imágenes.

## Privacidad

- `data/` (BD + adjuntos) contiene datos personales y fiscales: **gitignored siempre** (única excepción: `data/irnr.db.example`, BD demo con datos ficticios). `private/` también está gitignored.
- No metas NIF, nombres de inquilinos, direcciones completas ni IBAN en código, fixtures commiteados, tests o logs. En fixtures usa valores ficticios (también para la referencia catastral, proveedores y comunidad); solo importes y fechas pueden ser reales.
- No publiques nada (artifacts, gists, servicios externos).

## Convenciones

- Importes siempre en **céntimos enteros** (`number`), nunca floats en BD. Formatea solo en la UI con `lib/money.ts`.
- Fechas en BD como `YYYY-MM-DD` (texto). Sin zonas horarias.
- El motor fiscal recibe `today` como parámetro cuando lo necesite (plazos, avisos) — nada de `new Date()` dentro.
- Server actions validan entrada con **zod**.
- Componentes: server components por defecto; `"use client"` solo donde haya interacción.
- Commits pequeños y por fase, mensaje en inglés imperativo. Sin footers de atribución automáticos.
