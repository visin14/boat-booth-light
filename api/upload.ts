import { put } from "@vercel/blob";

// Receives the finished booth photo (raw JPEG body) and stores it in Vercel
// Blob, returning a short public URL that the result screen turns into a QR code.
// Requires the BLOB_READ_WRITE_TOKEN env var (created by linking a Blob store
// to the Vercel project).
const MAX_BYTES = 4 * 1024 * 1024; // Vercel function request bodies cap at ~4.5 MB

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("content-type") !== "image/jpeg") {
    return Response.json({ error: "Expected image/jpeg" }, { status: 415 });
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BYTES) {
    return Response.json({ error: "Invalid image size" }, { status: 413 });
  }
  // JPEG magic bytes: FF D8 FF
  if (body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) {
    return Response.json({ error: "Not a JPEG" }, { status: 400 });
  }

  const blob = await put("boat-booth/photo.jpg", body, {
    access: "public",
    addRandomSuffix: true,
    contentType: "image/jpeg",
  });
  return Response.json({ url: blob.downloadUrl });
}
