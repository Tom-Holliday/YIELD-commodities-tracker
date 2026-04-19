const data = [
  { commodity: "Brent Crude", price: 85.2, change: 1.2, category: "Energy" },
  { commodity: "WTI Crude", price: 81.9, change: 1.0, category: "Energy" },
  { commodity: "Natural Gas", price: 2.14, change: -0.4, category: "Energy" },
  { commodity: "Gold", price: 2380, change: -0.3, category: "Metals" },
  { commodity: "Silver", price: 28.4, change: 0.6, category: "Metals" },
  { commodity: "Copper", price: 4.55, change: 0.8, category: "Metals" },
  { commodity: "Wheat", price: 5.7, change: -0.4, category: "Agriculture" },
  { commodity: "Corn", price: 4.43, change: 0.2, category: "Agriculture" },
  { commodity: "Soybeans", price: 11.84, change: 0.5, category: "Agriculture" },
  { commodity: "Coffee", price: 2.31, change: 1.7, category: "Softs" },
  { commodity: "Sugar", price: 0.2, change: -0.8, category: "Softs" }
];

let currentFilter = "All";

function formatPrice(value) {
  if (value >= 1000) return `$${value.toLocaleString()}`;
  if (value >= 10) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

function renderStats() {
  const sorted = [...data].sort((a, b) => b.change - a.change);
  const topGainer = sorted[0];
  const topLoser = sorted[sorted.length - 1];

  document.getElementById("top-gainer").textContent =
    `${topGainer.commodity} (+${topGainer.change}%)`;

  document.getElementById("top-loser").textContent =
    `${topLoser.commodity} (${topLoser.change}%)`;
}

function renderTable() {
  const tbody = document.querySelector("#tracker tbody");
  tbody.innerHTML = "";

  const filtered =
    currentFilter === "All"
      ? data
      : data.filter((item) => item.category === currentFilter);

  for (const item of filtered) {
    const row = document.createElement("tr");
    const changeClass = item.change >= 0 ? "positive" : "negative";
    const sign = item.change > 0 ? "+" : "";

    row.innerHTML = `
      <td>${item.commodity}</td>
      <td>${formatPrice(item.price)}</td>
      <td class="${changeClass}">${sign}${item.change}%</td>
      <td>${item.category}</td>
    `;

    tbody.appendChild(row);
  }
}

function setFilter(category) {
  currentFilter = category;

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === category);
  });

  renderTable();
}

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => setFilter(btn.dataset.filter));
});

renderStats();
renderTable();