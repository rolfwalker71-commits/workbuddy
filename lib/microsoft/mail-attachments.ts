import { graphFetch, graphJson } from "@/lib/microsoft/graph";

export type MicrosoftMailAttachmentMeta = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId: string | null;
  odataType: string;
};

type GraphAttachment = {
  id?: string;
  name?: string | null;
  contentType?: string | null;
  size?: number;
  isInline?: boolean;
  contentId?: string | null;
  "@odata.type"?: string;
};

const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;

export function isPdfAttachment(meta: {
  name: string;
  contentType: string;
}): boolean {
  const name = meta.name.toLowerCase();
  const type = meta.contentType.toLowerCase();
  return name.endsWith(".pdf") || type === "application/pdf" || type.includes("pdf");
}

export async function listMicrosoftMessageAttachments(
  userId: number,
  messageId: string
): Promise<MicrosoftMailAttachmentMeta[]> {
  const qs = new URLSearchParams({
    $select: "id,name,contentType,size,isInline,contentId",
  });
  const data = await graphJson<{ value?: GraphAttachment[] }>(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}/attachments?${qs}`
  );
  const out: MicrosoftMailAttachmentMeta[] = [];
  for (const a of data.value || []) {
    if (!a.id) continue;
    const odataType = a["@odata.type"] || "";
    if (odataType && !odataType.includes("fileAttachment")) continue;
    const contentId = (a.contentId || "").replace(/^<|>$/g, "").trim() || null;
    out.push({
      id: a.id,
      name: (a.name || "anhang").trim() || "anhang",
      contentType: (a.contentType || "application/octet-stream").trim(),
      size: Number(a.size) || 0,
      isInline: Boolean(a.isInline),
      contentId,
      odataType,
    });
  }
  return out;
}

export async function listMicrosoftPdfAttachments(
  userId: number,
  messageId: string
): Promise<MicrosoftMailAttachmentMeta[]> {
  const all = await listMicrosoftMessageAttachments(userId, messageId);
  return all.filter(
    (a) => !a.isInline && isPdfAttachment(a) && a.size <= MAX_ATTACHMENT_BYTES
  );
}

export async function downloadMicrosoftAttachment(
  userId: number,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const res = await graphFetch(
    userId,
    `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Anhang laden fehlgeschlagen (${res.status}): ${text.slice(0, 200)}`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("Anhang ist zu gross (max. 40 MB).");
  }
  return buf;
}

export function isImageMailAttachment(meta: {
  name: string;
  contentType: string;
}): boolean {
  const type = (meta.contentType || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(meta.name || "");
}

/** Inline signature / tracking images — nicht als Ticket-Anhang. */
export function isSignatureOrInlineImageAttachment(
  meta: MicrosoftMailAttachmentMeta,
  strippedContentIds?: string[]
): boolean {
  if (strippedContentIds?.length && meta.contentId) {
    const cid = meta.contentId.toLowerCase();
    if (
      strippedContentIds.some(
        (c) => c.toLowerCase() === cid || cid.includes(c.toLowerCase())
      )
    ) {
      return true;
    }
  }
  if (!isImageMailAttachment(meta)) return false;
  const name = meta.name.toLowerCase();
  if (/signatur|signature|logo|footer|stempel|image00[0-3]/.test(name)) {
    return true;
  }
  if (meta.size > 0 && meta.size < 2500) return true;
  const gif = meta.contentType.toLowerCase().includes("gif") || name.endsWith(".gif");
  if (gif && meta.size > 0 && meta.size < 12_000) return true;
  return meta.isInline && /image00[0-9]|logo|signatur|signature/.test(name);
}

export function listMicrosoftTicketFileAttachments(
  all: MicrosoftMailAttachmentMeta[],
  strippedContentIds?: string[]
): MicrosoftMailAttachmentMeta[] {
  return all.filter(
    (a) =>
      a.size <= MAX_ATTACHMENT_BYTES &&
      !isSignatureOrInlineImageAttachment(a, strippedContentIds)
  );
}

export { MAX_ATTACHMENT_BYTES };
