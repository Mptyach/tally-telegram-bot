const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TALLY_FORM_ID_ACTUAL,
  TALLY_FORM_ID_OLD,
} = process.env;

const STALE_THRESHOLD_MS = 10 * 60 * 1000;

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
  if (!field) return "—";

  if (Array.isArray(field.value)) {
    if (field.value.length === 0) return "—";
    const resolved = field.value.map(function (v) {
      if (isUUID(String(v)) && Array.isArray(field.options)) {
        const opt = field.options.find(function (o) {
          return o.id === v;
        });
        return opt ? opt.text : v;
      }
      return v;
    });
    return resolved.join(", ");
  }

  const val = field.value;

  if (val && isUUID(String(val))) {
    if (Array.isArray(field.options)) {
      const opt = field.options.find(function (o) {
        return o.id === val;
      });
      if (opt) return opt.text;
    }
    const selected = fields.filter(function (f) {
      if (!f.label) return false;
      return (
        f.label.toLowerCase().includes(normalized) &&
        (f.value === true || f.value === "true")
      );
    });
    if (selected.length > 0) {
      const options = selected.map(function (f) {
        const m = f.label.match(/\(([^)]+)\)\s*$/);
        return m ? m[1].trim() : f.label;
      });
      return options.join(", ");
    }
    return "—";
  }

  return val || "—";
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

async function sendTelegram(text) {
  const response = await fetch(
    "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: text }),
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error("Telegram API error " + response.status + ": " + errText);
  }
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("Incoming webhook:", new Date().toISOString());

  try {
    const body = req.body;
    const data = body && body.data;

    if (!data) {
      console.warn("No data field in payload");
      return res.status(400).json({ error: "Missing data field" });
    }

    const createdAt = body.createdAt || data.createdAt;
    if (createdAt) {
      const ageMs = Date.now() - new Date(createdAt).getTime();
      if (ageMs > STALE_THRESHOLD_MS) {
        console.log(
          "Skipping stale submission. createdAt=" +
            createdAt +
            " ageMs=" +
            ageMs
        );
        return res.status(200).json({ ok: true, skipped: "stale", ageMs });
      }
    }

    const formId = data.formId;
    const fields = data.fields || [];

    console.log("Form ID: " + formId + ", Fields: " + fields.length);

    const source = getSource(formId);
    const message = formatMessage(source, fields);

    await sendTelegram(message);
    console.log("Sent successfully");

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
