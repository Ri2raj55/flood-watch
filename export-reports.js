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
  const csvHeader = "id,location,level,desc,name,date,photoFile\n";
  const csvRows = allData.map((r) =>
    [r.id, r.location, r.level, r.desc, r.name, r.date, r.photoFile]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  fs.writeFileSync(
    path.join(outDir, "reports.csv"),
    csvHeader + csvRows.join("\n")
  );

  console.log(`Done. Exported ${allData.length} reports to:`);
  console.log(`  ${path.join(outDir, "reports.json")}`);
  console.log(`  ${path.join(outDir, "reports.csv")}`);
  console.log(`  ${photosDir} (${allData.filter(r => r.photoFile).length} photos)`);
}

exportReports().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
