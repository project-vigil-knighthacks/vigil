// ---------- FILTER + COUNTER ----------
const ruleSearch = document.getElementById("ruleSearch");
const severityFilter = document.getElementById("ruleSeverityFilter");
const statusFilter = document.getElementById("ruleStatusFilter");
const clearBtn = document.getElementById("clearRuleFilters");
const rulesBody = document.getElementById("rulesTableBody");
const rulesCounter = document.getElementById("rulesCounter");

function rowTextContent(row) {
  const cellsText = row.textContent.toLowerCase();
  const sev = (row.dataset.severity || "").toLowerCase();
  const stat = (row.dataset.status || "").toLowerCase();
  return (cellsText + " " + sev + " " + stat).trim();
}

function applyRuleFilters() {
  const query = (ruleSearch.value || "").toLowerCase().trim();
  const sev = severityFilter.value;
  const stat = statusFilter.value;

  const rows = rulesBody.querySelectorAll("tr");
  const total = rows.length;
  let shown = 0;

  rows.forEach(row => {
    const rowSev = row.dataset.severity;
    const rowStat = row.dataset.status;

    const matchSev = (sev === "all") || (rowSev === sev);
    const matchStat = (stat === "all") || (rowStat === stat);

    const text = rowTextContent(row);
    const matchSearch = (query === "") || text.includes(query);

    const visible = matchSev && matchStat && matchSearch;
    row.style.display = visible ? "" : "none";
    if (visible) shown++;
  });

  if (rulesCounter) {
    rulesCounter.textContent = `Showing ${shown} of ${total} rules`;
  }
}

// Hook up filter events
if (ruleSearch) ruleSearch.addEventListener("input", applyRuleFilters);
if (severityFilter) severityFilter.addEventListener("change", applyRuleFilters);
if (statusFilter) statusFilter.addEventListener("change", applyRuleFilters);

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    ruleSearch.value = "";
    severityFilter.value = "all";
    statusFilter.value = "all";
    applyRuleFilters();
  });
}

// ---------- ADD RULE ----------
const addRuleBtn = document.getElementById("addRuleBtn");
const ruleNameInput = document.getElementById("ruleName");
const ruleDescInput = document.getElementById("ruleDesc");
const ruleThresholdInput = document.getElementById("ruleThreshold");
const ruleSeverityInput = document.getElementById("ruleSeverity");
const ruleStatusInput = document.getElementById("ruleStatus");

function safeText(value) {
  return (value || "").trim();
}

function titleCase(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function addRuleToTable({ name, desc, threshold, severity, status }) {
  const tr = document.createElement("tr");

  // data attributes used by the filter
  tr.dataset.severity = severity; // "low" | "medium" | "high" | "critical"
  tr.dataset.status = status;     // "enabled" | "disabled"

  const tdName = document.createElement("td");
  const tdDesc = document.createElement("td");
  const tdThresh = document.createElement("td");
  const tdSev = document.createElement("td");
  const tdStatus = document.createElement("td");

  tdName.textContent = name;
  tdDesc.textContent = desc;
  tdThresh.textContent = threshold;
  tdSev.textContent = titleCase(severity);
  tdStatus.textContent = titleCase(status);

  tr.appendChild(tdName);
  tr.appendChild(tdDesc);
  tr.appendChild(tdThresh);
  tr.appendChild(tdSev);
  tr.appendChild(tdStatus);

  rulesBody.appendChild(tr);
}

if (addRuleBtn) {
  addRuleBtn.addEventListener("click", () => {
    const name = safeText(ruleNameInput.value);
    const desc = safeText(ruleDescInput.value);
    const threshold = safeText(ruleThresholdInput.value);
    const severity = ruleSeverityInput.value;
    const status = ruleStatusInput.value;

    // Basic validation
    if (!name) {
      alert("Rule Name is required.");
      ruleNameInput.focus();
      return;
    }

    // Defaults if left blank
    const finalDesc = desc || "No description provided.";
    const finalThreshold = threshold || "--";

    addRuleToTable({
      name,
      desc: finalDesc,
      threshold: finalThreshold,
      severity,
      status
    });

    // Clear the form (keep severity/status as-is if you want)
    ruleNameInput.value = "";
    ruleDescInput.value = "";
    ruleThresholdInput.value = "";

    // Re-apply filters so the new row respects current filter + updates counter
    applyRuleFilters();
  });
}

// Run once on load
applyRuleFilters();
