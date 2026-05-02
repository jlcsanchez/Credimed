/**
 * credimed-translation (Lambda) — Spanish factura → English
 *
 * Independent of the submission flow: invoked async after OCR,
 * writes the translation PDF to S3, and updates the claim record
 * with the S3 key. If this Lambda fails, the submitter still works
 * — it'll fax the bundle without the translation page (some
 * carriers accept; some reject — depends on policy). Decoupling
 * means a translation hiccup doesn't block submission.
 *
 * Trigger options (decide at deploy time):
 *   A. Direct invoke from credimed-ocr Lambda once OCR completes
 *   B. S3 PutObject event on the OCR'd factura JSON
 *   C. EventBridge schedule that polls for claims with factura but
 *      no translation (catch-up path for failed/missed runs)
 *
 * Recommended: A for the happy path + C as a daily catch-up.
 *
 * Steps:
 *   1. Read claim from DynamoDB
 *   2. Read factura text (already OCR'd, stored either inline on
 *      the claim record or as a JSON file in S3)
 *   3. Translate via Amazon Translate (HIPAA-eligible, AWS BAA)
 *   4. Render to a simple PDF (pdf-lib, monospace, side-by-side
 *      Spanish | English where helpful)
 *   5. Save to s3://credimed-edi-archive/{claimId}/translation.pdf
 *   6. Update claim record with translationS3Key + translatedAt
 *
 * IAM:
 *   dynamodb:GetItem / UpdateItem on credimed-claims
 *   translate:TranslateText        (HIPAA-eligible)
 *   s3:PutObject / GetObject       on credimed-edi-archive
 *
 * Env vars:
 *   ARCHIVE_BUCKET    default: credimed-edi-archive
 */

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const db        = new DynamoDBClient({ region: "us-west-2" });
const translate = new TranslateClient({ region: "us-west-2" });
const s3        = new S3Client({ region: "us-west-2" });

const TABLE          = "credimed-claims";
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET || "credimed-edi-archive";

/**
 * Common Spanish dental terms that Amazon Translate routinely mangles.
 * Pre-substitute before sending to Translate so the output uses the
 * carrier-friendly American English term.
 */
const DENTAL_GLOSSARY = {
  "endodoncia":           "Root canal therapy",
  "reconstrucción":       "Build-up",
  "corona provisional":   "Provisional crown",
  "corona definitiva":    "Permanent crown",
  "corona porcelana":     "Porcelain crown",
  "corona zirconio":      "Zirconia crown",
  "incrustación":         "Inlay/Onlay",
  "radiografía periapical":"Periapical x-ray",
  "radiografía panorámica":"Panoramic x-ray",
  "radiografía bite-wing":"Bitewing x-ray",
  "limpieza profunda":    "Deep cleaning (scaling and root planing)",
  "limpieza dental":      "Prophylaxis (dental cleaning)",
  "extracción simple":    "Simple extraction",
  "extracción quirúrgica":"Surgical extraction",
  "implante dental":      "Dental implant",
  "puente dental":        "Dental bridge",
  "carilla":              "Dental veneer",
  "blanqueamiento":       "Teeth whitening",
  "brackets":             "Orthodontic brackets",
  "ortodoncia":           "Orthodontia",
  "férula oclusal":       "Occlusal splint / night guard",
  "perno":                "Post (endodontic)",
  "muñón":                "Core build-up",
  "amalgama":             "Amalgam filling",
  "resina":               "Composite resin filling"
};

function preTranslateGlossary(spanish) {
  let out = spanish || "";
  for (const [es, en] of Object.entries(DENTAL_GLOSSARY)) {
    const re = new RegExp(`\\b${es}\\b`, "gi");
    out = out.replace(re, en);
  }
  return out;
}

async function translateText(text) {
  if (!text || !text.trim()) return "";
  // Amazon Translate has a 10,000 byte input limit per call. Most
  // facturas are well under, but split on double newlines just in case.
  const chunks = [];
  let current = "";
  for (const para of text.split(/\n\s*\n/)) {
    if (Buffer.byteLength(current + "\n\n" + para, "utf8") > 9500) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current) chunks.push(current);

  const translated = [];
  for (const chunk of chunks) {
    const r = await translate.send(new TranslateTextCommand({
      Text: preTranslateGlossary(chunk),
      SourceLanguageCode: "es",
      TargetLanguageCode: "en"
    }));
    translated.push(r.TranslatedText || "");
  }
  return translated.join("\n\n");
}

async function renderTranslationPdf(spanish, english, claim) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 750;
  const drawLine = (text, opts = {}) => {
    page.drawText(text, {
      x: opts.x || 36,
      y,
      size: opts.size || 10,
      font: opts.bold ? fontBold : font,
      color: opts.color || rgb(0, 0, 0)
    });
    y -= (opts.lineHeight || 14);
  };

  drawLine("ENGLISH TRANSLATION OF DENTAL FACTURA", { bold: true, size: 14, lineHeight: 22 });
  drawLine(`Claim ID: ${claim.claimId || "(unknown)"}`, { size: 9, lineHeight: 14 });
  drawLine(`Patient: ${[claim.firstName, claim.lastName].filter(Boolean).join(" ") || "(unknown)"}`, { size: 9, lineHeight: 14 });
  drawLine(`Translated: ${new Date().toISOString().slice(0, 10)} (Amazon Translate + Credimed dental glossary)`, { size: 9, lineHeight: 22 });

  drawLine("ENGLISH TRANSLATION", { bold: true, lineHeight: 18 });
  for (const line of english.split("\n")) {
    if (y < 80) break;
    drawLine(line.slice(0, 95));
  }

  // Add Spanish original on a second page for the carrier's reviewer
  if (spanish) {
    const page2 = pdf.addPage([612, 792]);
    let y2 = 750;
    page2.drawText("ORIGINAL FACTURA (Spanish)", {
      x: 36, y: y2, size: 14, font: fontBold, color: rgb(0, 0, 0)
    });
    y2 -= 28;
    for (const line of spanish.split("\n")) {
      if (y2 < 36) break;
      page2.drawText(line.slice(0, 95), {
        x: 36, y: y2, size: 10, font, color: rgb(0, 0, 0)
      });
      y2 -= 14;
    }
  }

  return pdf.save();
}

export const handler = async (event) => {
  // Two invocation shapes:
  //   1. Direct invoke from another Lambda: { claimId, facturaText }
  //   2. EventBridge / S3 event: claimId in detail
  const claimId = event.claimId
    || event.detail?.claimId
    || event.Records?.[0]?.s3?.object?.key?.split("/")[0];
  if (!claimId) {
    console.error("[translation] no claimId in event", JSON.stringify(event).slice(0, 500));
    return { ok: false, error: "missing_claim_id" };
  }

  // Source text: prefer payload (cheap), fall back to claim record
  let facturaText = event.facturaText;
  if (!facturaText) {
    const r = await db.send(new GetItemCommand({
      TableName: TABLE,
      Key: { claimId: { S: claimId } }
    }));
    facturaText = r.Item?.facturaText?.S || "";
  }
  if (!facturaText) {
    console.warn("[translation] no factura text for", claimId);
    return { ok: false, claimId, error: "no_factura_text" };
  }

  const claim = {
    claimId,
    firstName: "", lastName: ""
  };
  // Best-effort patient name fetch (won't decrypt PHI here — just for
  // the cover sheet; if missing, the page just shows "(unknown)")
  try {
    const r = await db.send(new GetItemCommand({
      TableName: TABLE,
      Key: { claimId: { S: claimId } },
      ProjectionExpression: "claimId"
    }));
    if (r.Item) claim.claimId = r.Item.claimId?.S || claimId;
  } catch {}

  const english = await translateText(facturaText);
  const pdfBytes = await renderTranslationPdf(facturaText, english, claim);

  const key = `${claimId}/translation.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: ARCHIVE_BUCKET,
    Key: key,
    Body: pdfBytes,
    ContentType: "application/pdf",
    ServerSideEncryption: "AES256"
  }));

  await db.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: { claimId: { S: claimId } },
    UpdateExpression: "SET translationS3Key = :k, translatedAt = :now",
    ExpressionAttributeValues: {
      ":k":   { S: key },
      ":now": { S: new Date().toISOString() }
    }
  }));

  console.log(JSON.stringify({
    event: "translation_done",
    claimId,
    s3Key: key,
    sizeBytes: pdfBytes.length,
    timestamp: new Date().toISOString()
  }));

  return { ok: true, claimId, s3Key: key };
};
