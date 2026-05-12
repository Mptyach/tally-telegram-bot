module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tally-telegram-bot",
    ts: new Date().toISOString(),
  });
};

