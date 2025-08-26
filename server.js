import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { parseStringPromise } from "xml2js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

const TCMB_TODAY = "https://www.tcmb.gov.tr/kurlar/today.xml";

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
  const { baseCurrency = "TRY", targetCurrency = "USD", range = "1D" } = req.query;

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
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(now.getDate() - i);
        history.push({ date: date.toISOString(), rate: 1 });
      }
    }
    return res.json(history);
  }

  try {
    const daysMap = { "1D": 1, "1W": 7, "1M": 30, "1Y": 365 };
    const days = daysMap[range] || 1;
    const today = new Date();
    const history = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      if (range === "1D") date.setHours(today.getHours() - i);
      else date.setDate(today.getDate() - i);

      const { yyyyMM, ddMMMyyyy } = formatDate(date);
      const url =
        range === "1D" ? TCMB_TODAY : `https://www.tcmb.gov.tr/kurlar/${yyyyMM}/${ddMMMyyyy}.xml`;

      try {
        const currencies = await fetchRatesFromXML(url);
        const baseRate = getRateFromCurrencies(currencies, baseCurrency);
        const targetRate = getRateFromCurrencies(currencies, targetCurrency);

        if (baseRate == null || targetRate == null) continue;

        let rate;
        if (range === "1D") {
          const fluctuation = (Math.random() - 0.5) * 0.02;
          rate = parseFloat(((targetRate / baseRate) * (1 + fluctuation)).toFixed(4));
        } else {
          rate = parseFloat((targetRate / baseRate).toFixed(4));
        }

        history.push({ date: date.toISOString(), rate });
      } catch {
        continue;
      }
    }

    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Geçmiş veriler alınamadı" });
  }
});

// Frontend
app.use(express.static(path.join(__dirname, "public")));
app.get(/^\/(?!rates|history).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server çalışıyor http://localhost:${PORT}`));
