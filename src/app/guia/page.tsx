const sources = [
  ["Orden HAC/623/2026 (BOE-A-2026-13573)", "https://www.boe.es/buscar/doc.php?id=BOE-A-2026-13573"],
  ["AEAT · plazos del modelo 210", "https://sede.agenciatributaria.gob.es/Sede/no-residentes/irnr-sin-establecimiento-permanente/declaracion-irnr-sin-establecimiento-permanente/modelo-plazo-declaracion.html"],
  ["AEAT · ejemplo de arrendamiento de inmuebles urbanos", "https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/impuesto-sobre-renta-no-residentes/modelo-210-irnr______a-no-residentes-permanente_/ejemplos-cumplimentacion/rendimientos-derivados-arrendamiento-inmuebles-urbanos.html"],
  ["AEAT · Manual IRPF 2024: intereses y reparación (límite y arrastre)", "https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2024/c04-rendimientos-capital-inmobiliario/gastos-deducibles/intereses-demas-gastos-financiacion-inmueble.html"],
  ["Reducción del 60 % y no residentes (GA_P)", "https://ga-p.com/publicaciones/las-personas-fisicas-no-residentes-titulares-de-inmuebles-en-espana-no-pueden-reducir-las-rentas-derivadas-de-su-alquiler/"],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">{children}</div>
    </section>
  );
}

export default function GuiaPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Guía fiscal</h1>

      <Section title="Marco">
        <p>
          Residente en la UE/EEE: tipo del <strong>19 %</strong> (24 % si no fuera UE/EEE) y derecho a deducir gastos
          (art. 24.6 TRLIRNR, con las reglas del art. 23 LIRPF y arts. 13–14 RIRPF). Hay que aportar el <strong>certificado de
          residencia fiscal de tu país</strong>. No se aplica la reducción del 60 % del alquiler de vivienda.
        </p>
      </Section>

      <Section title="Qué es deducible">
        <ul>
          <li><strong>Casillas 5–12 y 16</strong>: comunidad, formalización del contrato, defensa jurídica, gestión de terceros, suministros, seguros, tributos (IBI), saldos de dudoso cobro y otros. Los marcados «prorratea» se multiplican por días alquilados / días del año.</li>
          <li><strong>Casillas 1–4</strong>: intereses y gastos de financiación + reparación y conservación, con límite conjunto igual a los rendimientos íntegros; el exceso se arrastra 4 años (primero lo más antiguo).</li>
          <li><strong>Amortización</strong>: inmueble 3 % sobre el mayor entre coste de adquisición y valor catastral, por la proporción de construcción (casilla 14); mobiliario y electrodomésticos 10 % (casilla 13); mejoras 3 % (casilla 15). Siempre prorrateadas por días alquilados.</li>
          <li><strong>No deducible</strong>: el capital de la hipoteca (ordinario o anticipado), sanciones, uso personal y el propio IRNR.</li>
        </ul>
      </Section>

      <Section title="Renta imputada (tipo 02)">
        <p>Por los días en propiedad no alquilados: valor catastral total × 2 % (o 1,1 %) × días no alquilados / días del año, sin gastos, al 19 %.</p>
      </Section>

      <Section title="Plazos">
        <ul>
          <li>Tipo 01 a ingresar (agrupación anual): devengos 2024–2025, del 1 al 20 de enero del año siguiente; desde el devengo 2026, del 1 al 20 de abril.</li>
          <li>Tipo 01 con cuota cero: del 1 al 20 de enero del año siguiente.</li>
          <li>Tipo 02: hasta el 31 de diciembre del año siguiente (desde el devengo 2026, desde el 1 de abril).</li>
          <li>Fuera de plazo: recargo del 1 % más 1 % por mes completo de retraso; pasados 12 meses, 15 % más intereses de demora (art. 27 LGT). Solo informativo.</li>
        </ul>
      </Section>

      <Section title="Documentación a conservar">
        <ul>
          <li>Facturas y recibos de cada gasto deducible (adjúntalos en Movimientos).</li>
          <li>Contratos de alquiler, fianza y justificantes de los modelos 210 presentados.</li>
          <li>Escritura y gastos de la compra (coste de adquisición) y recibos del IBI.</li>
        </ul>
      </Section>

      <Section title="Fuentes">
        <ul>
          {sources.map(([label, href]) => (
            <li key={href}>
              <a className="underline underline-offset-2 hover:text-foreground" href={href} target="_blank" rel="noreferrer">{label}</a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
