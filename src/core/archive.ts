// Best-effort archiving of uploaded files to Supabase (Storage + a metadata
// row). Uses the plain REST/Storage HTTP APIs — no SDK, so the bundle stays
// small and dependency-free.
//
// The URL and publishable key below are safe to ship in a public build: the
// key only grants what row-level security allows, which here is INSERT-only
// (no reading or deleting other people's archives). See the xrk_archive_setup
// migration.

const SUPABASE_URL = "https://tlakhfplzjdtptodocbv.supabase.co";
const SUPABASE_KEY = "sb_publishable_8WURPk4qP-cezdCya8LLnw_9UU3oakF";
const BUCKET = "xrk-archive";

export interface ArchiveMeta {
  fileName: string;
  fileSize: number;
  format: string; // xrk | xrz | csv
  venue: string;
  driver: string;
  vehicle: string;
  session: string;
  logDate: string; // YYYY-MM-DD
  laps: number | null;
  channels: number | null;
  durationS: number | null;
}

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

/**
 * Upload the raw file and insert its metadata row. Returns true on success.
 * Never throws — archiving must never block or fail a conversion.
 */
export async function archiveUpload(
  file: Blob,
  meta: ArchiveMeta,
): Promise<boolean> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const path = `${day}/${randomId()}-${sanitize(meta.fileName)}`;

    const upload = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      },
    );
    if (!upload.ok) throw new Error(`storage ${upload.status}`);

    const insert = await fetch(`${SUPABASE_URL}/rest/v1/xrk_uploads`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        file_name: meta.fileName,
        file_size: meta.fileSize,
        format: meta.format,
        storage_path: path,
        venue: meta.venue || null,
        driver: meta.driver || null,
        vehicle: meta.vehicle || null,
        session: meta.session || null,
        log_date: meta.logDate || null,
        laps: meta.laps,
        channels: meta.channels,
        duration_s: meta.durationS,
      }),
    });
    if (!insert.ok) throw new Error(`insert ${insert.status}`);
    return true;
  } catch {
    return false;
  }
}
