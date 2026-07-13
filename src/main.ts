import "./style.css";
import { parseAimCsv } from "./core/aimCsv";
import { parseXrkFile } from "./core/xrkAdapter";
import { convert } from "./core/convert";
import {
  DEFAULT_NAME_TABLE,
  parseNameTable,
  stringifyNameTable,
  lookupName,
} from "./core/nameConversion";
import type { ParsedCsv, SessionMeta } from "./core/types";

interface FileEntry {
  id: number;
  fileName: string;
  parsed?: ParsedCsv;
  meta?: SessionMeta;
  error?: string;
  converted?: boolean;
}

const entries: FileEntry[] = [];
let nextId = 1;
let renameChannels = true;
let nameTableText = stringifyNameTable(DEFAULT_NAME_TABLE);

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="app-header">
    <h1>AiM <span class="arrow">→</span> MoTeC</h1>
    <span class="subtitle" style="margin:0">.xrk / .xrz / RaceStudio CSV → i2 Pro .ld/.ldx</span>
  </header>
  <p class="subtitle">
    Drop AiM log files here and download a MoTeC i2 Pro log pair (.ld + .ldx).
    Native <b>.xrk</b> and <b>.xrz</b> files are read directly — no RaceStudio or
    AiM software needed. RaceStudio <b>CSV</b> exports work too. Everything runs in
    your browser; no data leaves this page.
  </p>
  <div class="dropzone" id="dropzone">
    <div class="big">Drop AiM .xrk, .xrz or .csv files here</div>
    <div class="hint">or click to browse — multiple files supported</div>
    <input type="file" id="fileInput" accept=".xrk,.xrz,.csv,text/csv" multiple hidden />
  </div>
  <div class="options-bar">
    <label class="check">
      <input type="checkbox" id="renameCheck" checked />
      Rename channels to MoTeC standard
    </label>
    <button class="secondary" id="editTableBtn" type="button">Edit name table</button>
  </div>
  <div id="tableEditor" class="section" hidden>
    <h2>Name conversion table</h2>
    <textarea class="name-table" id="nameTableInput" spellcheck="false"></textarea>
  </div>
  <div class="section" id="filesSection" hidden>
    <h2>Files</h2>
    <div id="fileList"></div>
  </div>
  <footer>
    Native .xrk/.xrz parsing by <a href="https://github.com/cyprien0312/xrk-js" target="_blank" rel="noopener">xrk-js</a>
    (a TypeScript port of <a href="https://github.com/m3rlin45/libxrk" target="_blank" rel="noopener">libxrk</a>);
    .ld writer ported from <a href="https://github.com/ludovicb1239/Aim_2_MoTeC" target="_blank" rel="noopener">Aim_2_MoTeC</a>. All MIT.
    Generated files open in MoTeC i2 Pro.
  </footer>
`;

const dropzone = document.getElementById("dropzone")!;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const fileList = document.getElementById("fileList")!;
const filesSection = document.getElementById("filesSection")!;
const renameCheck = document.getElementById("renameCheck") as HTMLInputElement;
const editTableBtn = document.getElementById("editTableBtn")!;
const tableEditor = document.getElementById("tableEditor")!;
const nameTableInput = document.getElementById(
  "nameTableInput",
) as HTMLTextAreaElement;

nameTableInput.value = nameTableText;

renameCheck.addEventListener("change", () => {
  renameChannels = renameCheck.checked;
  render();
});
editTableBtn.addEventListener("click", () => {
  tableEditor.hidden = !tableEditor.hidden;
});
nameTableInput.addEventListener("input", () => {
  nameTableText = nameTableInput.value;
  render();
});

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

async function addFiles(files: FileList) {
  for (const file of Array.from(files)) {
    const entry: FileEntry = { id: nextId++, fileName: file.name };
    entries.push(entry);
    try {
      const fallbackDate = new Date(file.lastModified);
      const ext = file.name.toLowerCase().split(".").pop();
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
  }
  render();
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
    nameTable: parseNameTable(nameTableText),
  });
  download(`${result.baseName}.ld`, result.ld, "application/octet-stream");
  download(`${result.baseName}.ldx`, result.ldx, "application/xml");
  entry.converted = true;
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
  const table = parseNameTable(nameTableText);

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
