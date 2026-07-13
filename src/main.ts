import "./style.css";
import { parseAimCsv } from "./core/aimCsv";
import { parseXrkFile } from "./core/xrkAdapter";
import { convert } from "./core/convert";
import { archiveUpload, type ArchiveMeta } from "./core/archive";
import {
  DEFAULT_NAME_TABLE,
  lookupName,
  type NameConvert,
} from "./core/nameConversion";
import type { ParsedCsv, SessionMeta } from "./core/types";

interface FileEntry {
  id: number;
  fileName: string;
  parsed?: ParsedCsv;
  meta?: SessionMeta;
  error?: string;
  converted?: boolean;
  archived?: "pending" | "ok" | "failed";
}

const entries: FileEntry[] = [];
let nextId = 1;
let renameChannels = true;
const nameTable: NameConvert[] = DEFAULT_NAME_TABLE.map((e) => ({ ...e }));

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="hero">
    <h1>AiM <span class="arrow">&rarr;</span> MoTeC</h1>
    <p class="lead">
      Convert AiM <b>.xrk</b> / <b>.xrz</b> logs &mdash; or RaceStudio <b>CSV</b> exports &mdash;
      to MoTeC i2 Pro, right in your browser.
    </p>
  </header>
  <div class="dropzone" id="dropzone">
    <div class="dz-icon" aria-hidden="true">&darr;</div>
    <div class="big">Drop .xrk, .xrz or .csv files</div>
    <div class="hint">or click to choose &mdash; multiple files supported</div>
    <input type="file" id="fileInput" accept=".xrk,.xrz,.csv,text/csv" multiple hidden />
  </div>
  <p class="status" id="status">Conversion runs in your browser. A copy of each upload is archived.</p>
  <div class="options">
    <label class="check">
      <input type="checkbox" id="renameCheck" checked />
      <span>Rename channels to MoTeC standard</span>
    </label>
    <button class="link-btn" id="editTableBtn" type="button">Edit name table</button>
  </div>
  <div id="tableEditor" class="section" hidden>
    <div class="section-title">Name conversion table</div>
    <p class="table-note">
      When &ldquo;Rename channels&rdquo; is on, AiM channels matching a name below are renamed to the
      MoTeC name (and short name) on conversion.
    </p>
    <div class="nt-wrap">
      <table class="nt">
        <thead>
          <tr><th>AiM name</th><th>MoTeC name</th><th>Short name</th><th aria-label="Remove"></th></tr>
        </thead>
        <tbody id="nameTableBody"></tbody>
      </table>
    </div>
    <div class="nt-actions">
      <button class="link-btn" id="addRowBtn" type="button">+ Add mapping</button>
      <button class="link-btn" id="resetTableBtn" type="button">Reset to defaults</button>
    </div>
  </div>
  <div class="section" id="filesSection" hidden>
    <div class="section-title">Files</div>
    <div id="fileList"></div>
  </div>
`;

const dropzone = document.getElementById("dropzone")!;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const fileList = document.getElementById("fileList")!;
const filesSection = document.getElementById("filesSection")!;
const renameCheck = document.getElementById("renameCheck") as HTMLInputElement;
const editTableBtn = document.getElementById("editTableBtn")!;
const tableEditor = document.getElementById("tableEditor")!;
const nameTableBody = document.getElementById("nameTableBody")!;
const addRowBtn = document.getElementById("addRowBtn")!;
const resetTableBtn = document.getElementById("resetTableBtn")!;

const NT_COLUMNS: Array<[keyof NameConvert, string]> = [
  ["from", "AiM name, e.g. RPM"],
  ["to", "MoTeC name"],
  ["toShort", "Short name"],
];

/** Rebuild the editable name-conversion table from the current model. */
function renderNameTable() {
  nameTableBody.replaceChildren();
  nameTable.forEach((row, i) => {
    const tr = document.createElement("tr");
    for (const [key, placeholder] of NT_COLUMNS) {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.value = row[key];
      input.placeholder = placeholder;
      input.spellcheck = false;
      input.addEventListener("input", () => {
        nameTable[i][key] = input.value;
        render(); // refresh the rename preview on file cards; keeps input focus
      });
      td.appendChild(input);
      tr.appendChild(td);
    }
    const rmTd = document.createElement("td");
    rmTd.className = "nt-remove";
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "nt-remove-btn";
    rm.setAttribute("aria-label", `Remove ${row.from || "mapping"}`);
    rm.textContent = "×";
    rm.addEventListener("click", () => {
      nameTable.splice(i, 1);
      renderNameTable();
      render();
    });
    rmTd.appendChild(rm);
    tr.appendChild(rmTd);
    nameTableBody.appendChild(tr);
  });
}

renameCheck.addEventListener("change", () => {
  renameChannels = renameCheck.checked;
  render();
});
editTableBtn.addEventListener("click", () => {
  tableEditor.hidden = !tableEditor.hidden;
});
addRowBtn.addEventListener("click", () => {
  nameTable.push({ from: "", to: "", toShort: "" });
  renderNameTable();
  const last = nameTableBody.querySelector("tr:last-child input");
  if (last instanceof HTMLInputElement) last.focus();
});
resetTableBtn.addEventListener("click", () => {
  nameTable.splice(0, nameTable.length, ...DEFAULT_NAME_TABLE.map((e) => ({ ...e })));
  renderNameTable();
  render();
});

renderNameTable();

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () =>
  dropzone.classList.remove("dragover"),
);
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files) addFiles(fileInput.files);
  fileInput.value = "";
});

function setStatus(text: string) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

async function addFiles(files: FileList) {
  const list = Array.from(files);
  for (const file of list) {
    const entry: FileEntry = { id: nextId++, fileName: file.name };
    entries.push(entry);
    setStatus(`Reading ${file.name}…`);
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    try {
      const fallbackDate = new Date(file.lastModified);
      let parsed;
      if (ext === "xrk" || ext === "xrz") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        parsed = parseXrkFile(bytes, { fallbackDate });
      } else {
        parsed = parseAimCsv(await file.text(), { fallbackDate });
      }
      entry.parsed = parsed;
      entry.meta = { ...parsed.meta };
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
    }
    startArchive(entry, file, ext);
  }
  const ok = entries.filter((e) => e.parsed).length;
  const bad = entries.filter((e) => e.error).length;
  setStatus(`${ok} file(s) loaded${bad ? `, ${bad} failed` : ""}.`);
  render();
}

/** Archive an uploaded file in the background; never blocks conversion. */
function startArchive(entry: FileEntry, file: File, ext: string) {
  const p = entry.parsed;
  const p2 = (n: number) => String(n).padStart(2, "0");
  const meta: ArchiveMeta = {
    fileName: file.name,
    fileSize: file.size,
    format: ext,
    venue: p?.meta.venue ?? "",
    driver: p?.meta.driver ?? "",
    vehicle: p?.meta.vehicle ?? "",
    session: p?.meta.session ?? "",
    logDate: p ? `${p.meta.year}-${p2(p.meta.month)}-${p2(p.meta.day)}` : "",
    laps: p ? p.laps.totalLaps : null,
    channels: p ? p.channels.length : null,
    durationS: p ? Math.round(p.duration) : null,
  };
  entry.archived = "pending";
  archiveUpload(file, meta).then((ok) => {
    entry.archived = ok ? "ok" : "failed";
    render();
  });
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function metaToLocalInput(meta: SessionMeta): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${meta.year}-${p(meta.month)}-${p(meta.day)}T${p(meta.hour)}:${p(meta.minute)}:${p(meta.second)}`;
}

function download(name: string, data: Uint8Array | string, mime: string) {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: mime })
      : new Blob([data.slice().buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function convertEntry(entry: FileEntry) {
  if (!entry.parsed || !entry.meta) return;
  const result = convert(entry.parsed, entry.meta, {
    renameChannels,
    nameTable,
  });
  download(`${result.baseName}.ld`, result.ld, "application/octet-stream");
  download(`${result.baseName}.ldx`, result.ldx, "application/xml");
  entry.converted = true;
  setStatus(`Saved ${result.baseName}.ld + .ldx.`);
  render();
}

const META_FIELDS: Array<[keyof SessionMeta & string, string]> = [
  ["driver", "Driver"],
  ["vehicle", "Vehicle"],
  ["venue", "Venue"],
  ["session", "Session"],
  ["shortComment", "Comment"],
];

function render() {
  filesSection.hidden = entries.length === 0;
  fileList.innerHTML = "";
  const table = nameTable;

  for (const entry of entries) {
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "file-head";
    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = entry.fileName;
    head.appendChild(name);

    if (entry.parsed) {
      const stats = document.createElement("span");
      stats.className = "file-stats";
      const p = entry.parsed;
      stats.textContent = `${p.channels.length} channels · ${p.laps.totalLaps} laps · ${fmtDuration(p.duration)} · ${p.channels[0]?.freq ?? "?"} Hz`;
      head.appendChild(stats);
    }
    if (entry.archived) {
      const badge = document.createElement("span");
      badge.className = `archive-badge archive-${entry.archived}`;
      badge.textContent =
        entry.archived === "ok"
          ? "Archived"
          : entry.archived === "failed"
            ? "Not archived"
            : "Archiving…";
      head.appendChild(badge);
    }
    card.appendChild(head);

    if (entry.error) {
      const err = document.createElement("div");
      err.className = "error";
      err.textContent = `Could not parse: ${entry.error}`;
      card.appendChild(err);
      fileList.appendChild(card);
      continue;
    }
    if (!entry.parsed || !entry.meta) continue;

    if (entry.parsed.warnings.length > 0) {
      const w = document.createElement("div");
      w.className = "warnings";
      w.textContent = "⚠ " + entry.parsed.warnings.join(" ");
      card.appendChild(w);
    }

    // Editable session metadata
    const grid = document.createElement("div");
    grid.className = "meta-grid";
    for (const [key, label] of META_FIELDS) {
      const lab = document.createElement("label");
      lab.textContent = label;
      const input = document.createElement("input");
      input.type = "text";
      input.value = String(entry.meta[key]);
      input.addEventListener("input", () => {
        (entry.meta as unknown as Record<string, string>)[key] = input.value;
      });
      lab.appendChild(input);
      grid.appendChild(lab);
    }
    const dateLab = document.createElement("label");
    dateLab.textContent = "Session date & time";
    const dateInput = document.createElement("input");
    dateInput.type = "datetime-local";
    dateInput.step = "1";
    dateInput.value = metaToLocalInput(entry.meta);
    dateInput.addEventListener("input", () => {
      const d = new Date(dateInput.value);
      if (Number.isNaN(d.getTime()) || !entry.meta) return;
      entry.meta.year = d.getFullYear();
      entry.meta.month = d.getMonth() + 1;
      entry.meta.day = d.getDate();
      entry.meta.hour = d.getHours();
      entry.meta.minute = d.getMinutes();
      entry.meta.second = d.getSeconds();
    });
    dateLab.appendChild(dateInput);
    grid.appendChild(dateLab);
    card.appendChild(grid);

    // Channel preview
    const details = document.createElement("details");
    details.className = "channels";
    const summary = document.createElement("summary");
    summary.textContent = `Preview ${entry.parsed.channels.length} channels`;
    details.appendChild(summary);
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const tbl = document.createElement("table");
    tbl.innerHTML = `<thead><tr><th>AiM name</th><th>MoTeC name</th><th>Unit</th><th>Rate</th><th>Samples</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    for (const ch of entry.parsed.channels) {
      const hit = renameChannels ? lookupName(table, ch.name) : undefined;
      const tr = document.createElement("tr");
      const cells = [
        ch.name,
        hit ? `→ ${hit.to}` : "—",
        ch.unit || "—",
        `${ch.freq} Hz`,
        String(ch.values.length),
      ];
      cells.forEach((text, i) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (i === 1 && hit) td.className = "renamed";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    details.appendChild(wrap);
    card.appendChild(details);

    // Actions
    const actions = document.createElement("div");
    actions.className = "row-actions";
    const btn = document.createElement("button");
    btn.className = "primary";
    btn.textContent = "Convert & download .ld + .ldx";
    btn.addEventListener("click", () => convertEntry(entry));
    actions.appendChild(btn);
    if (entry.converted) {
      const done = document.createElement("span");
      done.className = "done";
      done.textContent = "✓ downloaded — open the .ld in i2 Pro";
      actions.appendChild(done);
    }
    card.appendChild(actions);
    fileList.appendChild(card);
  }
}
