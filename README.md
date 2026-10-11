# IRNR

Aplicación **local** para ayudar a preparar y presentar el **Modelo 210** del Impuesto sobre la Renta de No Residentes (IRNR) en España.

Sirve para llevar la gestión de **un inmueble situado en España** cuyo propietario **no reside en España** pero sí en otro país de la **Unión Europea o del Espacio Económico Europeo**. Esa es la situación para la que está pensada: tipo del 19 % y derecho a deducir gastos. Otros supuestos (por ejemplo, residentes fuera de la UE/EEE) no están cubiertos.

> Es una herramienta de ayuda, no asesoramiento fiscal. Contrasta los resultados con las instrucciones de la Agencia Tributaria o con un gestor antes de presentar nada.

Un solo usuario, sin cuentas ni autenticación, sin despliegue: todos los datos viven en tu equipo.

## Qué contiene

- **Dashboard** del ejercicio elegido:
  - Resumen con ingresos, gastos y resultado.
  - Gráficas de ingresos y gastos por mes y de gastos por casilla del anexo.
  - **Alertas y tareas pendientes**: movimientos sin categoría, gastos sin factura o sin adjunto, gastos recurrentes que faltan, arrastres que caducan, plazos próximos o vencidos con aviso de recargo.
  - Una tarjeta por ejercicio con su estado (presentado, pendiente, fuera de plazo), el plazo y la cuota calculada frente a la presentada.
- **Movimientos**: libro de ingresos y gastos del inmueble con categorías fiscales, filtros, facturas y recibos adjuntos (PDF o imagen), importes en euros con formato español y exportación a CSV.
- **Declaración por ejercicio**:
  - Rendimientos del alquiler (tipo de renta 01) con el *Anexo de desglose de gastos deducibles* (casillas 1–17).
  - Renta imputada (tipo de renta 02) por los días en que el inmueble no estuvo alquilado.
  - Límite conjunto de intereses y reparaciones, con arrastre del exceso durante 4 años.
  - Amortización del inmueble, del mobiliario y de las mejoras.
  - Plazos de presentación y recargos por extemporaneidad.
  - Comparativa con lo ya presentado y exportación del anexo y de los movimientos a CSV, además de una vista de impresión.
- **Seguimiento de presentaciones**: registro de cada declaración presentada (fecha, justificante, importes) con su PDF adjunto.
- **Configuración**: datos del inmueble, valores catastrales por año, tipo de gravamen y contratos de alquiler (que generan los ingresos mensuales).
- **Guía fiscal** con el resumen de las reglas aplicadas y enlaces a las fuentes oficiales.
- Tema claro y oscuro, según el sistema o el interruptor de la barra lateral.
- Import opcional desde una hoja de Google y carpetas de Drive (solo lectura).

## Arranque

```bash
npm install                            # usa .npmrc (cache local); no sudo
cp data/irnr.db.example data/irnr.db   # BD demo con datos ficticios
npm run dev                            # http://localhost:3000
```

Para empezar con una base vacía en lugar de la demo: `npm run db:migrate && npm run seed`. El `seed` carga categorías y datos de ejemplo del inmueble, así que **no lo ejecutes sobre una base con tus datos reales**.

### Import opcional

`npm run import -- --with-drive` lee una hoja de Google y PDFs de Drive con la CLI `gws`. Necesita estas variables de entorno: `IRNR_SHEET_ID`, `IRNR_DRIVE_FOLDER_MAIN`, `IRNR_DRIVE_FOLDER_TAXES` y, opcionalmente, `IRNR_SHEET_TAB_EXPENSES` (nombre de la pestaña de gastos, por defecto `Gastos`) y `GOOGLE_WORKSPACE_CLI_CONFIG_DIR` si usas varias cuentas. Solo **lee** la hoja y Drive.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm test` / `npm run test:watch` | Vitest (motor fiscal, capa de datos, seed, import) |
| `npm run test:cov` | Cobertura; exige 100 % de ramas en `src/lib/tax` |
| `npm run test:e2e` | Playwright contra `next dev` en :3100 con BD demo (`data-test/`, `IRNR_TODAY=2026-10-10`) |
| `npm run db:generate` | `drizzle-kit generate` tras cambiar `src/db/schema.ts` |
| `npm run db:example` | Regenera `data/irnr.db.example` |
| `npm run build`, `npm run lint`, `npx tsc --noEmit` | Comprobaciones |

## Datos y copia de seguridad

Todo vive en `data/` (**gitignored**, salvo `irnr.db.example`): `irnr.db` (SQLite) y `attachments/<año>/…`. Copia de seguridad = copiar esa carpeta con la app parada (o `sqlite3 data/irnr.db ".backup copia.db"` junto con `attachments/`). `IRNR_DATA_DIR` cambia la ubicación; `IRNR_TODAY=YYYY-MM-DD` fija «hoy» (tests).

No metas NIF, nombres de inquilinos, direcciones completas ni IBAN en código, fixtures o logs.

## Documentación para desarrolladores

Reglas, arquitectura y metodología (TDD) en [AGENTS.md](AGENTS.md).
