import { dataDir, getDb } from "@/db/client";
import { contentDisposition, readAttachmentFile } from "@/server/attachments";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("No encontrado", { status: 404 });
  const found = readAttachmentFile(getDb(), id, dataDir());
  if (!found) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.attachment.mime,
      "Content-Disposition": contentDisposition(found.attachment.filename),
      "Content-Length": String(found.bytes.length),
    },
  });
}
