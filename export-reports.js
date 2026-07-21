// export-reports.js
// Exports all documents from the "flood-reports" Firestore collection
// to a local JSON file, and decodes each embedded base64 photo into
// a real .jpg file.
//
// Setup:
//   npm install firebase-admin
// Usage:
//   node export-reports.js
//
// Requires serviceAccountKey.json (from Firebase console >
// Project settings > Service accounts > Generate new private key)
// in the same folder as this script.

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function exportReports() {
  const outDir = path.join(__dirname, "flood-reports-export");
  const photosDir = path.join(outDir, "photos");
  fs.mkdirSync(photosDir, { recursive: true });

  console.log("Fetching documents from flood-reports...");
  const snapshot = await db.collection("flood-reports").orderBy("ts", "desc").get();

  if (snapshot.empty) {
    console.log("No documents found.");
    return;
  }

  const allData = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    let photoFilename = null;

    // Decode base64 photo into a real image file
    if (data.photo && data.photo.startsWith("data:image")) {
      const matches = data.photo.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1];
        const base64Data = matches[2];
        photoFilename = `${doc.id}.${ext}`;
        fs.writeFileSync(
          path.join(photosDir, photoFilename),
          Buffer.from(base64Data, "base64")
        );
      }
    }

    // Keep the JSON record clean — reference the photo file instead of
    // embedding the huge base64 string again
    allData.push({
      id: doc.id,
      location: data.location || "",
      level: data.level ?? null,
      desc: data.desc || "",
      name: data.name || "",
      phone: data.phone || "",
      ts: data.ts || null,
      date: data.ts ? new Date(data.ts).toISOString() : null,
      photoFile: photoFilename,
    });
  });

  fs.writeFileSync(
    path.join(outDir, "reports.json"),
    JSON.stringify(allData, null, 2)
  );

  // Also write a CSV for quick viewing in Excel/Sheets
  const csvHeader = "id,location,level,desc,name,phone,date,photoFile\n";
  const csvRows = allData.map((r) =>
    [r.id, r.location, r.level, r.desc, r.name, r.phone, r.date, r.photoFile]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  fs.writeFileSync(
    path.join(outDir, "reports.csv"),
    csvHeader + csvRows.join("\n")
  );

  // ---- combined report: photo + details together, one file, print-to-PDF ready ----
  const reportHtml = buildCombinedReport(snapshot);
  fs.writeFileSync(path.join(outDir, "combined-report.html"), reportHtml);

  console.log(`Done. Exported ${allData.length} reports to:`);
  console.log(`  ${path.join(outDir, "reports.json")}`);
  console.log(`  ${path.join(outDir, "reports.csv")}`);
  console.log(`  ${photosDir} (${allData.filter(r => r.photoFile).length} photos)`);
  console.log(`  ${path.join(outDir, "combined-report.html")}  <- open this, then Ctrl+P > Save as PDF to share`);
}

function buildCombinedReport(snapshot) {
  const SEV_LABEL = { 1: "Ankle-deep", 2: "Knee-deep", 3: "Waist-deep", 4: "Rooftop / impassable" };
  const rows = [];
  snapshot.forEach((doc) => {
    const d = doc.data();
    rows.push({
      id: doc.id,
      location: d.location || "Not given",
      level: SEV_LABEL[d.level] || "Unknown",
      desc: d.desc || "—",
      name: d.name || "Anonymous",
      phone: d.phone || "Not given",
      date: d.ts ? new Date(d.ts).toLocaleString("en-IN") : "Unknown",
      photo: d.photo || null,
    });
  });

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const entries = rows.map((r) => `
    <div class="entry">
      <div class="photo-box">
        ${r.photo ? `<img src="${r.photo}">` : `<div class="no-photo">No photo submitted</div>`}
      </div>
      <div class="details">
        <div class="row"><span class="label">Location</span><span class="value">${esc(r.location)}</span></div>
        <div class="row"><span class="label">Water level</span><span class="value">${esc(r.level)}</span></div>
        <div class="row"><span class="label">Reported by</span><span class="value">${esc(r.name)}</span></div>
        <div class="row"><span class="label">Phone</span><span class="value">${esc(r.phone)}</span></div>
        <div class="row"><span class="label">Date/time</span><span class="value">${esc(r.date)}</span></div>
        <div class="row full"><span class="label">Details</span><span class="value">${esc(r.desc)}</span></div>
        <div class="row"><span class="label">Report ID</span><span class="value mono">${esc(r.id)}</span></div>
      </div>
    </div>`).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Flood Watch — Combined Report</title>
<style>
  body{ font-family:Arial,sans-serif; color:#182231; margin:0; padding:32px; }
  h1{ font-size:22px; margin-bottom:4px; }
  .sub{ color:#5a6478; font-size:13px; margin-bottom:28px; }
  .entry{ display:flex; gap:20px; border:1px solid #d8d0ba; border-radius:6px; padding:16px; margin-bottom:18px; page-break-inside:avoid; }
  .photo-box{ width:220px; min-width:220px; height:165px; background:#f3efe4; border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
  .photo-box img{ width:100%; height:100%; object-fit:cover; }
  .no-photo{ color:#8a8a8a; font-size:12px; }
  .details{ flex:1; display:grid; grid-template-columns:1fr 1fr; gap:8px 20px; align-content:start; }
  .row{ font-size:13px; }
  .row.full{ grid-column:1/-1; }
  .label{ display:block; text-transform:uppercase; font-size:10px; color:#8a6a44; letter-spacing:0.04em; margin-bottom:2px; }
  .value{ color:#182231; }
  .value.mono{ font-family:monospace; font-size:11px; color:#5a6478; }
  @media print{ body{ padding:0; } .entry{ break-inside:avoid; } }
</style></head>
<body>
  <h1>Flood Watch — Community Reports</h1>
  <div class="sub">Combined report generated ${new Date().toLocaleString("en-IN")} · ${rows.length} report(s) · riturajborthakur.site</div>
  ${entries || "<p>No reports found.</p>"}
</body></html>`;
}

exportReports().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});