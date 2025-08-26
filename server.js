import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { parseStringPromise } from "xml2js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";             // <-- bunu ekle
import cron from "node-cron";

// ES Module __dirname ayarı
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Frontend dosyalarını servis et
app.use(express.static(path.join(__dirname, "public")));

const TCMB_TODAY = "https://www.tcmb.gov.tr/kurlar/today.xml";

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Yardımcı fonksiyonlar
function formatDate(date) {
  const yyyy = date.getFullYear();
  const MM = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");

  return {
    yyyyMM: `${yyyy}${MM}`,
    ddMMMyyyy: `${dd}${MM}${yyyy}`,
  };
}

async function fetchRatesFromXML(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("XML fetch error");
  const xml = await res.text();
  const parsed = await parseStringPromise(xml);
  return parsed.Tarih_Date.Currency;
}

function getRateFromCurrencies(currencies, code) {
  if (code === "TRY") return 1;
  const cur = currencies.find((c) => c.$.CurrencyCode === code);
  if (!cur) return null;
  const rateStr = cur.ForexSelling?.[0] || cur.BanknoteSelling?.[0];
  if (!rateStr) return null;
  return parseFloat(rateStr.replace(",", "."));
}

async function saveDailyRates() {
  const today = new Date();
  const { yyyyMM, ddMMMyyyy } = formatDate(today);
  const url = `https://www.tcmb.gov.tr/kurlar/${yyyyMM}/${ddMMMyyyy}.xml`;

  try {
    const currencies = await fetchRatesFromXML(url);
    const rates = { TRY: 1 };

    for (const cur of currencies) {
      const code = cur.$.CurrencyCode;
      const rateStr = cur.ForexSelling?.[0] || cur.BanknoteSelling?.[0];
      if (!rateStr) continue;
      rates[code] = parseFloat(rateStr.replace(",", "."));
    }

    const year = today.getFullYear();
    const filePath = path.join(DATA_DIR, `kur_${year}.json`);
    let history = [];

    if (fs.existsSync(filePath)) {
      history = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }

    history.push({ date: today.toISOString(), rates });
    fs.writeFileSync(filePath, JSON.stringify(history, null, 2));

    console.log("✅ Günlük veriler kaydedildi:", filePath);
  } catch (err) {
    console.error("❌ Günlük veri alınamadı:", err.message);
  }
}


// Son 1 yılın tüm verisini çek ve kaydet
app.get("/init-year", async (req, res) => {
  const today = new Date();
  const history = [];

  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const { yyyyMM, ddMMMyyyy } = formatDate(date);
    const url = `https://www.tcmb.gov.tr/kurlar/${yyyyMM}/${ddMMMyyyy}.xml`;

    try {
      const currencies = await fetchRatesFromXML(url);
      const rates = { TRY: 1 };

      for (const cur of currencies) {
        const code = cur.$.CurrencyCode;
        const rateStr = cur.ForexSelling?.[0] || cur.BanknoteSelling?.[0];
        if (!rateStr) continue;
        rates[code] = parseFloat(rateStr.replace(",", "."));
      }

      history.push({ date: date.toISOString(), rates });
    } catch {
      continue; // veri yoksa atla
    }
  }

  const year = today.getFullYear();
  const filePath = path.join(DATA_DIR, `kur_${year}.json`);
  fs.writeFileSync(filePath, JSON.stringify(history.reverse(), null, 2));

  res.json({ message: "Son 1 yıl verisi kaydedildi.", file: filePath });
});


// Güncel kurlar
app.get("/rates", async (req, res) => {
  try {
    const currencies = await fetchRatesFromXML(TCMB_TODAY);
    const rates = { TRY: 1 };

    for (const cur of currencies) {
      const code = cur.$.CurrencyCode;
      const rateStr = cur.ForexSelling?.[0] || cur.BanknoteSelling?.[0];
      if (!rateStr) continue;
      rates[code] = parseFloat(rateStr.replace(",", "."));
    }
    res.json(rates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Kurlar alınamadı" });
  }
});

// Tarihsel kurlar
app.get("/history", async (req, res) => {
  const {
    baseCurrency = "TRY",
    targetCurrency = "USD",
    range = "1D",
  } = req.query;

  if (baseCurrency === targetCurrency) {
    const now = new Date();
    const history = [];

    if (range === "1D") {
      for (let i = 24; i >= 0; i--) {
        const date = new Date(now);
        date.setHours(now.getHours() - i);
        history.push({ date: date.toISOString(), rate: 1 });
      }
    } else {
      const daysMap = { "1W": 7, "1M": 30, "1Y": 365 };
      const days = daysMap[range];
      if (!days) return res.status(400).json({ error: "Desteklenmeyen range" });

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        history.push({ date: date.toISOString(), rate: 1 });
      }
    }
    return res.json(history);
  }

  if (range === "1D") {
    try {
      const currencies = await fetchRatesFromXML(TCMB_TODAY);
      const baseRate = getRateFromCurrencies(currencies, baseCurrency);
      const targetRate = getRateFromCurrencies(currencies, targetCurrency);

      if (baseRate == null || targetRate == null)
        return res.status(400).json({ error: "Geçersiz para birimi" });

      const now = new Date();
      const history = [];

      for (let i = 24; i >= 0; i--) {
        const date = new Date(now);
        date.setHours(now.getHours() - i);

        const fluctuation = (Math.random() - 0.5) * 0.02;
        const rate = ((targetRate / baseRate) * (1 + fluctuation)).toFixed(4);

        history.push({ date: date.toISOString(), rate: parseFloat(rate) });
      }

      return res.json(history);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "1D geçmiş veriler alınamadı." });
    }
  }

  try {
    const daysMap = { "1W": 7, "1M": 30, "1Y": 365 };
    const days = daysMap[range];
    if (!days) return res.status(400).json({ error: "Desteklenmeyen range" });

    const today = new Date();
    const history = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const { yyyyMM, ddMMMyyyy } = formatDate(date);
      const url = `https://www.tcmb.gov.tr/kurlar/${yyyyMM}/${ddMMMyyyy}.xml`;

      try {
        const currencies = await fetchRatesFromXML(url);
        const baseRate = getRateFromCurrencies(currencies, baseCurrency);
        const targetRate = getRateFromCurrencies(currencies, targetCurrency);

        if (baseRate == null || targetRate == null) continue;

        history.push({
          date: date.toISOString(),
          rate: parseFloat((targetRate / baseRate).toFixed(4)),
        });
      } catch {
        continue;
      }
    }

    return res.json(history);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Geçmiş veriler alınamadı." });
  }
});

// Tüm diğer route’lar frontend’e yönlendir 
app.get(/^\/(?!rates|history).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

cron.schedule("0 16 * * *", () => {
  saveDailyRates();
});

// Server başlat
app.listen(PORT, () =>
  console.log(`Server çalışıyor http://localhost:${PORT}`)
);
