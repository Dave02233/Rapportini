export function formatEuro(value) {
  return Number(value || 0).toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

export function formatOre(value) {
  return Number(value || 0).toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

export function byId(list) {
  return Object.fromEntries((list || []).map((item) => [item.id, item]));
}

export function formatData(value) {
  if (!value) return "-";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatPeriodo({ data_inizio, data_fine }) {
  if (data_inizio && data_fine) {
    return `${formatData(data_inizio)} - ${formatData(data_fine)}`;
  }
  if (data_inizio) return `dal ${formatData(data_inizio)}`;
  if (data_fine) return `fino al ${formatData(data_fine)}`;
  return null;
}
