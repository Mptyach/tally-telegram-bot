require("dotenv").config();
const express = require("express");
const https = require("https");

const app = express();
app.use(express.json());

// âââ Config ââââââââââââââââââââââââââââââââââââââââââââââ
const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TALLY_FORM_ID_ACTUAL,
  TALLY_FORM_ID_OLD,
} = process.env;

const PORT = process.env.PORT || 3000;

// âââ Helpers âââââââââââââââââââââââââââââââââââââââââââââ

/**
 * ÐÐ¿ÑÐµÐ´ÐµÐ»ÑÐµÑ Ð¸ÑÑÐ¾ÑÐ½Ð¸Ðº Ð·Ð°ÑÐ²ÐºÐ¸ Ð¿Ð¾ formId
 */
function getSource(formId) {
  if (formId === TALLY_FORM_ID_ACTUAL) return "ÐÐºÑÑÐ°Ð»ÑÐ½Ð°Ñ Ð°Ð½ÐºÐµÑÐ°";
  if (formId === TALLY_FORM_ID_OLD) return "Ð¡ÑÐ°ÑÐ°Ñ Ð°Ð½ÐºÐµÑÐ°";
  return "ÐÐµÐ¸Ð·Ð²ÐµÑÑÐ½ÑÐ¹ Ð¸ÑÑÐ¾ÑÐ½Ð¸Ðº";
}

/**
 * ÐÑÐ¾Ð²ÐµÑÑÐµÑ, ÑÐ²Ð»ÑÐµÑÑÑ Ð»Ð¸ ÑÑÑÐ¾ÐºÐ° UUID
 */
function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * ÐÑÐµÑ Ð·Ð½Ð°ÑÐµÐ½Ð¸Ðµ Ð¿Ð¾Ð»Ñ Ð² Ð¼Ð°ÑÑÐ¸Ð²Ðµ fields Ð¿Ð¾ label (ÑÐµÐ³Ð¸ÑÑÑÐ¾Ð½ÐµÐ·Ð°Ð²Ð¸ÑÐ¸Ð¼Ð¾).
 * ÐÑÐ»Ð¸ Ð·Ð½Ð°ÑÐµÐ½Ð¸Ðµ â UUID (radio/checkbox), Ð¸ÑÐµÑ ÑÐ²ÑÐ·Ð°Ð½Ð½ÑÐµ Ð¿Ð¾Ð»Ñ Ñ value="true"
 * Ð¸ Ð¸Ð·Ð²Ð»ÐµÐºÐ°ÐµÑ ÑÐµÐºÑÑ Ð¾Ð¿ÑÐ¸Ð¸ Ð¸Ð· ÑÐºÐ¾Ð±Ð¾Ðº Ð² label.
 * ÐÑÐ»Ð¸ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾ â Ð²Ð¾Ð·Ð²ÑÐ°ÑÐ°ÐµÑ "â".
 */
function getField(fields, label) {
  const normalized = label.toLowerCase();
  const field = fields.find(
    (f) => f.label && f.label.toLowerCase().includes(normalized)
  );
  if (!field) return "â";

  // Tally Ð¼Ð¾Ð¶ÐµÑ Ð²ÐµÑÐ½ÑÑÑ Ð¼Ð°ÑÑÐ¸Ð² (Ð½Ð°Ð¿ÑÐ¸Ð¼ÐµÑ, Ð´Ð»Ñ ÑÐµÐºÐ±Ð¾ÐºÑÐ¾Ð²)
  if (Array.isArray(field.value)) {
    return field.value.length > 0 ? field.value.join(", ") : "â";
  }

  const val = field.value;

  // ÐÑÐ»Ð¸ Ð·Ð½Ð°ÑÐµÐ½Ð¸Ðµ â UUID, ÑÑÐ¾ radio/checkbox: Ð¸ÑÐµÐ¼ sub-Ð¿Ð¾Ð»Ñ Ñ value=true
  if (val && isUUID(String(val))) {
    const selected = fields.filter((f) => {
      if (!f.label) return false;
      const lbl = f.label.toLowerCase();
      return lbl.includes(normalized) && (f.value === true || f.value === "true");
    });

    if (selected.length > 0) {
      // ÐÐ·Ð²Ð»ÐµÐºÐ°ÐµÐ¼ ÑÐµÐºÑÑ Ð¾Ð¿ÑÐ¸Ð¸ Ð¸Ð· ÑÐºÐ¾Ð±Ð¾Ðº, Ð½Ð°Ð¿ÑÐ¸Ð¼ÐµÑ "ÐÑÐ¾ Ð²Ñ (Ð¤ÑÐ¸Ð»Ð°Ð½ÑÐµÑ)" â "Ð¤ÑÐ¸Ð»Ð°Ð½ÑÐµÑ"
      const options = selected.map((f) => {
        const match = f.label.match(/\(([^)]+)\)\s*$/);
        return match ? match[1].trim() : f.label;
      });
      return options.join(", ");
    }
    return "â";
  }

  return val || "â";
}

/**
 * Ð¤Ð¾ÑÐ¼Ð¸ÑÑÐµÑ ÑÐµÐºÑÑ ÑÐ¾Ð¾Ð±ÑÐµÐ½Ð¸Ñ Ð´Ð»Ñ Telegram
 */
function formatMessage(source, fields) {
  const name = getField(fields, "ÐÐ°ÑÐµ ÐÐ¼Ñ");
  const telegram = getField(fields, "ÐÐ°Ñ Telegram");
  const instagram = getField(fields, "ÐÐ°Ñ Instagram");
  const role = getField(fields, "ÐÑÐ¾ Ð²Ñ");
  const request = getField(fields, "ÐÐ°Ñ Ð·Ð°Ð¿ÑÐ¾Ñ Ð¿Ð¾ ÑÐ¾Ð·Ð´Ð°Ð½Ð¸Ñ ÐºÐ¾Ð½ÑÐµÐ½ÑÐ°");
  const experience = getField(fields, "ÐÐ¿Ð¸ÑÐ¸ÑÐµ Ð²Ð°Ñ Ð¾Ð¿ÑÑ");
  const readiness = getField(fields, "Ð¥Ð¾ÑÐµÐ»Ð¸ Ð±Ñ ÑÑÐ°ÑÑ ÑÐ°ÑÑÑÑ");

  return [
    `ð ${source}`,
    ``,
    `ð ÐÐ¾Ð²Ð°Ñ Ð·Ð°ÑÐ²ÐºÐ° Ð² ÐÐ°Ð±Ð¾ÑÐ°ÑÐ¾ÑÐ¸Ñ!`,
    ``,
    `ð¤ ${name}`,
    `ð± TG: ${telegram}`,
    `ð¸ IG: ${instagram}`,
    `ð· ÐÑÐ¾: ${role}`,
    `â ÐÐ°Ð¿ÑÐ¾Ñ: ${request}`,
    `ð ÐÐ¿ÑÑ: ${experience}`,
    `ð¥ ÐÐ¾ÑÐ¾Ð²Ð½Ð¾ÑÑÑ: ${readiness}`,
    ``,
    `ð¬ ÐÐ°Ð³Ð¾ÑÐ¾Ð²ÐºÐ°:`,
    `${name}, Ð¿ÑÐ¸Ð²ÐµÑ!`,
    `Ð¯ ÐÐ°ÑÐ²ÐµÐ¹, Ð¿Ð°ÑÑÐ½ÐµÑ ÐÐ°Ð²Ð»Ð° Ð² Ð°Ð³ÐµÐ½ÑÑÑÐ²Ðµ Ð¿Ð¾ Ð¿ÑÐ¾Ð´Ð²Ð¸Ð¶ÐµÐ½Ð¸Ñ Ñ Ð¿Ð¾Ð¼Ð¾ÑÑÑ ÐÐ.`,
    ``,
    `ÐÐ·ÑÑÐ¸Ð» Ð°Ð½ÐºÐµÑÑ,`,
  ].join("\n");
}

/**
 * ÐÑÐ¿ÑÐ°Ð²Ð»ÑÐµÑ ÑÐ¾Ð¾Ð±ÑÐµÐ½Ð¸Ðµ Ð² Telegram ÑÐµÑÐµÐ· Bot API (Ð½Ð°ÑÐ¸Ð²Ð½ÑÐ¹ https)
 */
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
    });

    const options = {
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Telegram API error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// âââ Routes ââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Health-check
 */
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "tally-telegram-bot" });
});

/**
 * ÐÑÐ½Ð¾Ð²Ð½Ð¾Ð¹ webhook-endpoint Ð´Ð»Ñ Tally
 */
app.post("/webhook/tally", async (req, res) => {
  console.log("\nââââââââââââââââââââââââââââââââââââââââ");
  console.log("ð© Incoming webhook:", new Date().toISOString());
  console.log("ââââââââââââââââââââââââââââââââââââââââ");

  // ÐÐ¾Ð³Ð¸ÑÑÐµÐ¼ Ð¿Ð¾Ð»Ð½ÑÐ¹ payload â Ð¿ÑÐ¸Ð³Ð¾Ð´Ð¸ÑÑÑ Ð¿ÑÐ¸ Ð¿ÐµÑÐ²Ð¾Ð¼ Ð·Ð°Ð¿ÑÑÐºÐµ
  console.log("Full payload:", JSON.stringify(req.body, null, 2));

  try {
    const { data } = req.body;

    if (!data) {
      console.warn("â ï¸  No 'data' field in payload");
      return res.status(400).json({ error: "Missing data field" });
    }

    const formId = data.formId;
    const fields = data.fields || [];

    console.log(`ð Form ID: ${formId}`);
    console.log(`ð Form name: ${data.formName || "â"}`);
    console.log(`ð Fields count: ${fields.length}`);

    // ÐÐ¾Ð³Ð¸ÑÑÐµÐ¼ Ð²ÑÐµ Ð¿Ð¾Ð»Ñ Ð´Ð»Ñ Ð¾ÑÐ»Ð°Ð´ÐºÐ¸ Ð¼Ð°Ð¿Ð¿Ð¸Ð½Ð³Ð°
    fields.forEach((f, i) => {
      console.log(`   [${i}] key="${f.key}" label="${f.label}" â "${f.value}"`);
    });

    const source = getSource(formId);
    const message = formatMessage(source, fields);

    console.log("\nð¤ Sending to Telegram...");
    await sendTelegram(message);
    console.log("â Sent successfully!");

    res.json({ ok: true });
  } catch (err) {
    console.error("â Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// âââ Start âââââââââââââââââââââââââââââââââââââââââââââââ

app.listen(PORT, () => {
  console.log(`\nð Server running on port ${PORT}`);
  console.log(`   Webhook URL: POST http://localhost:${PORT}/webhook/tally`);
  console.log(`   Health check: GET  http://localhost:${PORT}/`);
  console.log(`\n   TALLY_FORM_ID_ACTUAL = ${TALLY_FORM_ID_ACTUAL || "NOT SET"}`);
  console.log(`   TALLY_FORM_ID_OLD    = ${TALLY_FORM_ID_OLD || "NOT SET"}`);
  console.log(`   TELEGRAM_CHAT_ID     = ${TELEGRAM_CHAT_ID || "NOT SET"}`);
  console.log(`   TELEGRAM_BOT_TOKEN   = ${TELEGRAM_BOT_TOKEN ? "â set" : "NOT SET"}\n`);
});
