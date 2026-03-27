require("dotenv").config();
const express = require("express");
const https = require("https");

const app = express();
app.use(express.json());

// ─── Config ──────────────────────────────────────────────
const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TALLY_FORM_ID_ACTUAL,
  TALLY_FORM_ID_OLD,
} = process.env;

const PORT = process.env.PORT || 3000;

// ─── Helpers ─────────────────────────────────────────────

/**
 * Определяет источник заявки по formId
 */
function getSource(formId) {
  if (formId === TALLY_FORM_ID_ACTUAL) return "Актуальная анкета";
  if (formId === TALLY_FORM_ID_OLD) return "Старая анкета";
  return "Неизвестный источник";
}

/**
 * Ищет значение поля в массиве fields по label (регистронезависимо).
 * Если не найдено — возвращает "—".
 */
function getField(fields, label) {
  const normalized = label.toLowerCase();
  const field = fields.find(
    (f) => f.label && f.label.toLowerCase().includes(normalized)
  );
  if (!field) return "—";

  // Tally может вернуть массив (например, для чекбоксов)
  if (Array.isArray(field.value)) {
    return field.value.length > 0 ? field.value.join(", ") : "—";
  }
  return field.value || "—";
}

/**
 * Формирует текст сообщения для Telegram
 */
function formatMessage(source, fields) {
  const name = getField(fields, "Ваше Имя");
  const telegram = getField(fields, "Ваш Telegram");
  const instagram = getField(fields, "Ваш Instagram");
  const role = getField(fields, "Кто вы");
  const request = getField(fields, "Ваш запрос по созданию контента");
  const experience = getField(fields, "Опишите ваш опыт");
  const readiness = getField(fields, "Хотели бы стать частью");

  return [
    `📌 ${source}`,
    ``,
    `📋 Новая заявка в Лабораторию!`,
    ``,
    `👤 ${name}`,
    `📱 TG: ${telegram}`,
    `📸 IG: ${instagram}`,
    `🏷 Кто: ${role}`,
    `❓ Запрос: ${request}`,
    `📝 Опыт: ${experience}`,
    `🔥 Готовность: ${readiness}`,
    ``,
    `💬 Заготовка:`,
    `${name}, привет!`,
    `Я Матвей, партнер Павла в агентстве по продвижению с помощью ИИ.`,
    ``,
    `Изучил анкету,`,
  ].join("\n");
}

/**
 * Отправляет сообщение в Telegram через Bot API (нативный https)
 */
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
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

// ─── Routes ──────────────────────────────────────────────

/**
 * Health-check
 */
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "tally-telegram-bot" });
});

/**
 * Основной webhook-endpoint для Tally
 */
app.post("/webhook/tally", async (req, res) => {
  console.log("\n════════════════════════════════════════");
  console.log("📩 Incoming webhook:", new Date().toISOString());
  console.log("════════════════════════════════════════");

  // Логируем полный payload — пригодится при первом запуске
  console.log("Full payload:", JSON.stringify(req.body, null, 2));

  try {
    const { data } = req.body;

    if (!data) {
      console.warn("⚠️  No 'data' field in payload");
      return res.status(400).json({ error: "Missing data field" });
    }

    const formId = data.formId;
    const fields = data.fields || [];

    console.log(`📝 Form ID: ${formId}`);
    console.log(`📝 Form name: ${data.formName || "—"}`);
    console.log(`📝 Fields count: ${fields.length}`);

    // Логируем все поля для отладки маппинга
    fields.forEach((f, i) => {
      console.log(`   [${i}] key="${f.key}" label="${f.label}" → "${f.value}"`);
    });

    const source = getSource(formId);
    const message = formatMessage(source, fields);

    console.log("\n📤 Sending to Telegram...");
    await sendTelegram(message);
    console.log("✅ Sent successfully!");

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`   Webhook URL: POST http://localhost:${PORT}/webhook/tally`);
  console.log(`   Health check: GET  http://localhost:${PORT}/`);
  console.log(`\n   TALLY_FORM_ID_ACTUAL = ${TALLY_FORM_ID_ACTUAL || "NOT SET"}`);
  console.log(`   TALLY_FORM_ID_OLD    = ${TALLY_FORM_ID_OLD || "NOT SET"}`);
  console.log(`   TELEGRAM_CHAT_ID     = ${TELEGRAM_CHAT_ID || "NOT SET"}`);
  console.log(`   TELEGRAM_BOT_TOKEN   = ${TELEGRAM_BOT_TOKEN ? "✅ set" : "NOT SET"}\n`);
});
