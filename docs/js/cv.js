// Reads a CV PDF to plain text IN THE BROWSER with pdf.js (spec 04 R-CV-1). The file itself
// never leaves the device; only the extracted text is sent to /api/profile.
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38";
const MAX_BYTES = 5 * 1024 * 1024;

export async function pdfToText(file) {
  if (file.size > MAX_BYTES) throw { code: "cv_unreadable", message: "That file is over 5 MB. Paste the text instead." };
  let pdfjs;
  try {
    pdfjs = await import(/* @vite-ignore */ `${PDFJS}/pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  } catch {
    throw { code: "cv_unreadable", message: "Could not load the PDF reader. Paste the CV text instead." };
  }
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts = [];
  for (let i = 1; i <= Math.min(doc.numPages, 8); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it) => it.str).join(" "));
  }
  const text = parts.join("\n").replace(/[ \t]+/g, " ").trim();
  if (text.length < 200) throw { code: "cv_unreadable", message: "I could not find readable text in that PDF (a scan, perhaps). Paste the text, or fill the form by hand." };
  return text;
}
