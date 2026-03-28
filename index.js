require("dotenv").config();
const express = require("express");
const https = require("https");

const app = express();
app.use(express.json());

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TALLY_FORM_ID_ACTUAL,
  TALLY_FORM_ID_OLD,
} = process.env;

const PORT = process.env.PORT || 3000;

function getSource(formId) {
  if (formId === TALLY_FORM_ID_ACTUAL) return "Актуальная анкета";
  if (formId === TALLY_FORM_ID_OLD) return "Старая анкета";
  return "Неизвестный источник";
}

function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function getField(fields, label) {
  const normalized = label.toLowerCase();
  const field = fields.find(
    (f) => f.label && f.label.toLowerCase().includes(normalized)
  );
  if (!field) return "\u2014";

  if (Array.isArray(field.value)) {
    return field.value.length > 0 ? field.value.join(", ") : "\u2014";
  }

  const val = field.value;

  if (val && isUUID(String(val))) {
    const selected = fields.filter((f) => {
      if (!f.label) return false;
      const lbl = f.label.toLowerCase();
      return lbl.includes(normalized) && (f.value === true || f.value === "true");
    });

    if (selected.length > 0) {
      const options = selected.map((f) => {
        const match = f.label.match(/\(([^)]+)\)\s*$/);
        return match ? match[1].trim() : f.label;
      });
      return options.join(", ");
    }
    return "\u2014";
  }

  return val || "\u2014";
}

function formatMessage(source, fields) {
  const name = getField(fields, "Ваше Имя");
  const telegram = getField(fields, "Ваш Telegram");
  const instagram = getField(fields, "Ваш Instagram");
  const role = getField(fields, "Кто вы");
  const request = getField(fields, "Ваш запрос по созданию контента");
  const experience = getField(fields, "Опишите ваш опыт");
  const readiness = getField(fields, "Хотели бы стать частью");

  return [
    "📌 " + source,
    "",
    "📋 Новая заявка в Лабораторию!",
    "",
    "👤 " + name,
    "📱 TG: " + telegram,
    "📸 IG: " + instagram,
    "🏷 Кто: " + role,
    "❓ Запрос: " + request,
    "📝 Опыт: " + experience,
    "🔥 Готовность: " + readiness,
    "",
    "💬 Заготовка:",
    name + ", привет!",
    "Я Матвей, партнер Павла в агентстве по продвижению с помощью ИИ.",
    "",
    "Изучил анкету,",
  ].join("\n");
}

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

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "tally-telegram-bot" });
});

app.post("/webhook/tally", async (req, res) => {
  console.log("\n\u2550".repeat(1) + "\u2550".repeat(39));
  console.log("📩 Incoming webhook:", new Date().toISOString());
  console.log("Full payload:", JSON.stringify(req.body, null, 2));

  try {
    const { data } = req.body;

    if (!data) {
      console.warn("No data field in payload");
      return res.status(400).json({ error: "Missing data field" });
    }

    const formId = data.formId;
    const fields = data.fields || [];

    console.log("Form ID: " + formId);
    console.log("Fields count: " + fields.length);

    fields.forEach((f, i) => {
      console.log("  [" + i + "] label=\"" + f.label + "\" value=\"" + f.value + "\"");
    });

    const source = getSource(formId);
    const message = formatMessage(source, fields);

    console.log("Sending to Telegram...");
    await sendTelegram(message);
    console.log("Sent successfully!");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
  console.log("TALLY_FORM_ID_ACTUAL = " + (TALLY_FORM_ID_ACTUAL || "NOT SET"));
  console.log("TALLY_FORM_ID_OLD    = " + (TALLY_FORM_ID_OLD || "NOT SET"));
  console.log("TELEGRAM_CHAT_ID     = " + (TELEGRAM_CHAT_ID || "NOT SET"));
  console.log("TELEGRAM_BOT_TOKEN   = " + (TELEGRAM_BOT_TOKEN ? "set" : "NOT SET"));
});
