const data = [
  { commodity: "Brent Crude", price: "$85.20", change: "+1.2%", category: "Energy" },
  { commodity: "WTI Crude", price: "$81.90", change: "+1.0%", category: "Energy" },
  { commodity: "Gold", price: "$2,380", change: "-0.3%", category: "Metals" },
  { commodity: "Copper", price: "$4.55", change: "+0.8%", category: "Metals" },
  { commodity: "Wheat", price: "$5.70", change: "-0.4%", category: "Agriculture" }
];

const tbody = document.querySelector("#tracker tbody");

data.forEach(item => {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${item.commodity}</td>
    <td>${item.price}</td>
    <td>${item.change}</td>
    <td>${item.category}</td>
  `;
  tbody.appendChild(row);
});