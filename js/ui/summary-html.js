export function escapeSummaryText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function makeSummaryChip(label, value) {
  return (
    "<span class=\"summary-chip\">" +
    "<b>" + escapeSummaryText(label) + "</b>" +
    "<span class=\"summary-chip-value\">" + escapeSummaryText(value) + "</span>" +
    "</span>"
  );
}

export function makeDashboardCard(title, tone, bodyHtml) {
  return (
    "<section class=\"dashboard-card dashboard-" + escapeSummaryText(tone || "neutral") + "\">" +
    "<h2>" + escapeSummaryText(title) + "</h2>" +
    bodyHtml +
    "</section>"
  );
}

export function makePrimaryMetric(label, value, detail) {
  return (
    "<div class=\"primary-metric\">" +
    "<span>" + escapeSummaryText(label) + "</span>" +
    "<strong>" + escapeSummaryText(value) + "</strong>" +
    "<small>" + escapeSummaryText(detail || "") + "</small>" +
    "</div>"
  );
}

export function makeMetricRow(label, value) {
  return (
    "<span class=\"metric-row\">" +
    "<b>" + escapeSummaryText(label) + "</b>" +
    "<span>" + escapeSummaryText(value) + "</span>" +
    "</span>"
  );
}

export function getDashboardTraitMetric(stats, key) {
  var traits = stats && Array.isArray(stats.traitDistribution) ? stats.traitDistribution : [];

  for (var i = 0; i < traits.length; i++) {
    if (traits[i].key === key && Number.isFinite(Number(traits[i].value))) {
      return Number(traits[i].value).toFixed(2);
    }
  }

  return "-";
}

export function makeInspectChip(label, value) {
  return (
    "<span class=\"inspect-chip\">" +
    "<b>" + escapeSummaryText(label) + "</b>" +
    "<span>" + escapeSummaryText(value) + "</span>" +
    "</span>"
  );
}

export function makeAlertChip(alert) {
  return (
    "<span class=\"alert-chip alert-" + escapeSummaryText(alert.severity || "info") + "\">" +
    "<b>" + escapeSummaryText(alert.label || "Simulation") + "</b>" +
    "<span>" + escapeSummaryText(alert.detail || "") + "</span>" +
    "</span>"
  );
}
