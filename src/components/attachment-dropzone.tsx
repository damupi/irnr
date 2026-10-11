"use client";

import { FileText, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ExistingAttachment {
  id: number;
  filename: string;
  mime: string;
  size: number;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Arrastrar y soltar / seleccionar varios ficheros. Los nuevos quedan en `staged`; los existentes se listan con descarga y borrado. */
export function AttachmentDropzone({
  staged,
  onStagedChange,
  existing = [],
  onDeleteExisting,
}: {
  staged: File[];
  onStagedChange: (files: File[]) => void;
  existing?: ExistingAttachment[];
  onDeleteExisting?: (id: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<ExistingAttachment | null>(null);
  const add = (list: FileList | null) => list && onStagedChange([...staged, ...Array.from(list)]);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={cn("flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground", over && "border-primary bg-accent")}
      >
        <UploadCloud className="size-5" />
        <p>Arrastra aquí facturas o recibos (PDF, JPG, PNG, HEIC · máx. 20 MB)</p>
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>Seleccionar ficheros</Button>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic"
          className="hidden"
          aria-label="Ficheros adjuntos"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }}
        />
      </div>

      <ul className="space-y-1 text-sm">
        {existing.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <FileText className="size-4 shrink-0" />
            <a className="truncate underline underline-offset-2" href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">{a.filename}</a>
            <span className="text-xs text-muted-foreground">{kb(a.size)}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(preview?.id === a.id ? null : a)}>Previsualizar</Button>
            {onDeleteExisting && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Borrar adjunto ${a.filename}`} onClick={() => onDeleteExisting(a.id)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </li>
        ))}
        {staged.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-muted-foreground">
            <FileText className="size-4 shrink-0" />
            <span className="truncate">{f.name}</span>
            <span className="text-xs">{kb(f.size)} · pendiente de guardar</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${f.name}`} onClick={() => onStagedChange(staged.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {preview && (
        preview.mime === "application/pdf" ? (
          <iframe title={`Vista previa de ${preview.filename}`} src={`/api/attachments/${preview.id}`} className="h-72 w-full rounded-md border" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={preview.filename} src={`/api/attachments/${preview.id}`} className="max-h-72 rounded-md border" />
        )
      )}
    </div>
  );
}
