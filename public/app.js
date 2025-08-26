document.addEventListener("DOMContentLoaded", async () => {
  // Elementler
  const amountEl = document.getElementById("amount");
  const resultEl = document.getElementById("result");
  const fromCurrencyEl = document.getElementById("fromCurrency");
  const toCurrencyEl = document.getElementById("toCurrency");
  const swapBtn = document.getElementById("swapBtn");
  const convertBtn = document.getElementById("convertBtn");
  const chartTitle = document.getElementById("chart-title");
  const timeButtons = document.querySelectorAll(".time-range-controls button");
  const ctx = document.getElementById("currencyChart").getContext("2d");
  const oneUnitContainer = document.getElementById("oneUnitContainer");

  let rates = { TRY: 1 };
  let currencyChart;

  // Backend’den güncel kurları çek
  async function fetchRates() {
    try {
      const res = await fetch("/rates");
      if (!res.ok) throw new Error("Veri çekilemedi");
      const data = await res.json();
      Object.assign(rates, data);
      convertBtn.disabled = false;
      console.log("Kurlar yüklendi:", rates);
    } catch (err) {
      console.error("Kur verileri alınamadı:", err);
      alert("Kur verileri alınamadı!");
    }
  }

  // Döviz dönüşüm fonksiyonu
  function convert() {
    const amount = parseFloat(amountEl.value);
    if (isNaN(amount) || amount === 0) return;

    const from = fromCurrencyEl.value;
    const to = toCurrencyEl.value;
    if (!rates[from] || !rates[to]) return;

    const converted = amount * (rates[from] / rates[to]);
    resultEl.value = converted.toFixed(2);

    const rateInfo = (rates[from] / rates[to]).toFixed(4);
    oneUnitContainer.innerText = `1 ${from} = ${rateInfo} ${to}`;
  }

  swapBtn.addEventListener("click", async () => {
    [fromCurrencyEl.value, toCurrencyEl.value] = [
      toCurrencyEl.value,
      fromCurrencyEl.value,
    ];
    const range =
      document.querySelector(".time-range-controls .active")?.dataset.range ||
      "1W";
    const fromCurrency = fromCurrencyEl.value;
    const toCurrency = toCurrencyEl.value;

    chartTitle.textContent = `${fromCurrency} / ${toCurrency} Grafiği (${range})`;
    const history = await fetchCurrencyHistory(toCurrency, fromCurrency, range);
    createChart(toCurrency, fromCurrency, history, range);
    convert();
  });

  convertBtn.addEventListener("click", convert);

  async function fetchCurrencyHistory(baseCurrency, targetCurrency, range) {
    try {
      const res = await fetch(
        `/history?baseCurrency=${baseCurrency}&targetCurrency=${targetCurrency}&range=${range}`
      );
      if (!res.ok) throw new Error("Geçmiş veri alınamadı");
      const data = await res.json();
      return data.map((item) => ({
        date: item.date,
        rate: item.rate,
      }));
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  // Grafik oluşturma fonksiyonu
  function createChart(fromCurrency, toCurrency, ratesHistory, range) {
    if (fromCurrency === toCurrency) {
      ratesHistory = ratesHistory.map((item) => ({ date: item.date, rate: 1 }));
    }

    const labels = ratesHistory.map((item) => {
      const d = new Date(item.date);
      switch (range) {
        case "1D": {
          const hours = d.getHours().toString().padStart(2, "0");
          const minutes = d.getMinutes().toString().padStart(2, "0");
          return `${hours}:${minutes}`; // Saat:dk formatı
        }
        case "1W":
        case "1M":
          return d.toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "short",
          });
        case "1Y":
          return d.toLocaleDateString("tr-TR", {
            month: "short",
            year: "numeric",
          });
        default:
          return d.toLocaleDateString();
      }
    });

    const data = ratesHistory.map((item) => item.rate);

    if (currencyChart) currencyChart.destroy();

    currencyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `${toCurrency} / ${fromCurrency}`,
            data,
            borderColor: "rgba(75,192,192,1)",
            backgroundColor: "rgba(75,192,192,0.2)",
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: true },
          tooltip: {
            enabled: true,
            mode: "index",
            intersect: false,
            callbacks: {
              label: (context) =>
                `${context.dataset.label}: ${parseFloat(context.raw).toFixed(
                  4
                )}`,
            },
          },
          decimation: { enabled: true, algorithm: "lttb", samples: 100 },
        },
        scales: {
          y: {
            beginAtZero: false,
            min: Math.min(...data) * 0.999,
            max: Math.max(...data) * 1.001,
            ticks: { callback: (value) => value.toFixed(4) },
          },
        },
      },
    });
  }

  // Time range butonları ve dropdown eventleri (değişmedi)
  timeButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      document
        .querySelector(".time-range-controls .active")
        ?.classList.remove("active");
      btn.classList.add("active");

      const range = btn.dataset.range;
      const fromCurrency = fromCurrencyEl.value;
      const toCurrency = toCurrencyEl.value;
      chartTitle.textContent = `${fromCurrency} / ${toCurrency} Grafiği (${range})`;
      const history = await fetchCurrencyHistory(
        toCurrency,
        fromCurrency,
        range
      );
      createChart(toCurrency, fromCurrency, history, range);
    });
  });

  [toCurrencyEl, fromCurrencyEl].forEach((el) =>
    el.addEventListener("change", async () => {
      const range =
        document.querySelector(".time-range-controls .active")?.dataset.range ||
        "1Y";
      const fromCurrency = fromCurrencyEl.value;
      const toCurrency = toCurrencyEl.value;
      chartTitle.textContent = `${fromCurrency} / ${toCurrency} Grafiği (${range})`;
      const history = await fetchCurrencyHistory(
        toCurrency,
        fromCurrency,
        range
      );
      createChart(toCurrency, fromCurrency, history, range);
    })
  );

  // Başlangıç
  await fetchRates();

  const initialFrom = fromCurrencyEl.value;
  const initialTo = toCurrencyEl.value;
  const initialRange =
    document.querySelector(".time-range-controls .active")?.dataset.range ||
    "1W";
  chartTitle.textContent = `${initialFrom} / ${initialTo} Grafiği (${initialRange})`;
  const initialHistory = await fetchCurrencyHistory(
    initialFrom,
    initialTo,
    initialRange
  );
  createChart(initialFrom, initialTo, initialHistory, initialRange);
});
