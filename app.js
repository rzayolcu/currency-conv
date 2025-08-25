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
      const res = await fetch("http://localhost:3000/rates");
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

    // 1 birim oranı
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

  // Backend’den geçmiş kurları çek
  async function fetchCurrencyHistory(baseCurrency, targetCurrency, range) {
    try {
      const res = await fetch(
        `http://localhost:3000/history?baseCurrency=${baseCurrency}&targetCurrency=${targetCurrency}&range=${range}`
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Geçmiş veri alınamadı");
      }
      const data = await res.json();
      return data;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  // Grafik oluştur
  function createChart(fromCurrency, toCurrency, ratesHistory, range) {
    // Aynı para birimleri grafiği düz çizgi olmalı
    if (fromCurrency === toCurrency) {
      ratesHistory = ratesHistory.map((item) => ({
        date: item.date,
        rate: 1,
      }));
    }

    const labels = ratesHistory.map((item) => {
      const d = new Date(item.date);
      switch (range) {
        case "1D":
          return `${d.getHours()}:00`;
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
        labels: labels,
        datasets: [
          {
            label: `${fromCurrency} / ${toCurrency}`,
            data: data,
            borderColor: "rgba(75, 192, 192, 1)",
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            tension: 0.3,
            pointRadius: 0, 
            pointHoverRadius: 0, 
          },
        ],
      },
      options: {
        responsive: true,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: { display: true },
          tooltip: {
            enabled: true,
            mode: "index",
            intersect: false,
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${parseFloat(
                  context.raw
                ).toFixed(4)}`;
              },
            },
          },
          decimation: {
            enabled: true,
            algorithm: "lttb",
            samples: 50,
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function (value) {
                return value.toFixed(4); // Y ekseninde de 4 hane
              },
            },
          },
        },
      },
    });
  }

  // Time range butonları
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

  // Dropdown değiştiğinde grafiği güncelle
  toCurrencyEl.addEventListener("change", async () => {
    const range =
      document.querySelector(".time-range-controls .active")?.dataset.range ||
      "5Y";
    const fromCurrency = fromCurrencyEl.value;
    const toCurrency = toCurrencyEl.value;
    chartTitle.textContent = `${fromCurrency} / ${toCurrency} Grafiği (${range})`;
    const history = await fetchCurrencyHistory(toCurrency, fromCurrency, range);
    createChart(toCurrency, fromCurrency, history, range);
  });

  fromCurrencyEl.addEventListener("change", async () => {
    const range =
      document.querySelector(".time-range-controls .active")?.dataset.range ||
      "5Y";
    const fromCurrency = fromCurrencyEl.value;
    const toCurrency = toCurrencyEl.value;
    chartTitle.textContent = `${fromCurrency} / ${toCurrency} Grafiği (${range})`;
    const history = await fetchCurrencyHistory(toCurrency, fromCurrency, range);
    createChart(toCurrency, fromCurrency, history, range);
  });

  // Başlangıç
  await fetchRates();

  // İlk grafik
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
