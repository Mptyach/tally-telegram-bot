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
  if (!field) return "—";

  if (Array.isArray(field.value)) {
    if (field.value.length === 0) return "—";
    var resolved = field.value.map(function(v) {
      if (isUUID(String(v)) && Array.isArray(field.options)) {
        var opt = field.options.find(function(o) { return o.id === v; });
        return opt ? opt.text : v;
      }
      return v;
    });
    return resolved.join(", ");
  }

  var val = field.value;

  if (val && isUUID(String(val))) {
    if (Array.isArray(field.options)) {
      var opt = field.options.find(function(o) { return o.id === val; });
      if (opt) return opt.text;
    }
    var selected = fields.filter(function(f) {
      if (!f.label) return false;
      return f.label.toLowerCase().includes(normalized) && (f.value === true || f.value === "true");
    });
    if (selected.length > 0) {
      var options = selected.map(function(f) {
        var m = f.label.match(/\(([^)]+)\)\s*$/);
        return m ? m[1].trim() : f.label;
      });
      return options.join(", ");
    }
    return "—";
  }

  return val || "—";
}

function formatMessage(source, fields) {
  var name = getField(fields, "Ваше Имя");
  var telegram = getField(fields, "Ваш Telegram");
  var instagram = getField(fields, "Ваш Instagram");
  var role = getField(fields, "Кто вы");
  var request = getField(fields, "Ваш запрос по созданию контента");
  var experience = getField(fields, "Опишите ваш опыт");
  var readiness = getField(fields, "Хотели бы стать частью");

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
  return new Promise(function(resolve, reject) {
    var payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
    });

    var options = {
      hostname: "api.telegram.org",
      path: "/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    var req = https.request(options, function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error("Telegram API error " + res.statusCode + ": " + data));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

app.get("/", function(_req, res) {
  res.json({ status: "ok", service: "tally-telegram-bot" });
});

app.post("/webhook/tally", async function(req, res) {
  console.log("Incoming webhook:", new Date().toISOString());
  console.log("Full payload:", JSON.stringify(req.body, null, 2));

  try {
    var data = req.body.data;

    if (!data) {
      console.warn("No data field in payload");
      return res.status(400).json({ error: "Missing data field" });
    }

    var formId = data.formId;
    var fields = data.fields || [];

    console.log("Form ID: " + formId);
    console.log("Fields count: " + fields.length);

    fields.forEach(function(f, i) {
      console.log("  [" + i + "] label=" + f.label + " type=" + f.type + " value=" + JSON.stringify(f.value) + " options=" + JSON.stringify(f.options));
    });

    var source = getSource(formId);
    var message = formatMessage(source, fields);

    console.log("Sending to Telegram...");
    await sendTelegram(message);
    console.log("Sent successfully!");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, function() {
  console.log("Server running on port " + PORT);
  console.log("TALLY_FORM_ID_ACTUAL = " + (TALLY_FORM_ID_ACTUAL || "NOT SET"));
  console.log("TALLY_FORM_ID_OLD = " + (TALLY_FORM_ID_OLD || "NOT SET"));
  console.log("TELEGRAM_CHAT_ID = " + (TELEGRAM_CHAT_ID || "NOT SET"));
  console.log("TELEGRAM_BOT_TOKEN = " + (TELEGRAM_BOT_TOKEN ? "set" : "NOT SET"));
});
