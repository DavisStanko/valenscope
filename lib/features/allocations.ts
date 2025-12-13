// @ts-nocheck
"use client";

import { formatCurrency, formatPercent } from "@/lib/core/utils";

export function renderSurplusAllocations(currentData) {
  const container = document.getElementById("surplus-allocations-list");
  if (!container) return;

  const debts = (currentData.debts || [])
    .filter((d) => d.value > 0)
    .sort((a, b) => (b.apr || 0) - (a.apr || 0));

  const assets = (currentData.assets || [])
    .filter((a) => a.roi !== undefined)
    .sort((a, b) => (b.roi || 0) - (a.roi || 0));

  const allocations = [];

  for (const debt of debts) {
    allocations.push({
      id: debt.id,
      targetId: debt.id,
      targetType: "debt",
      name: debt.name,
      rate: debt.apr,
      value: debt.value,
    });
  }

  if (assets.length > 0) {
    allocations.push({
      id: assets[0].id,
      targetId: assets[0].id,
      targetType: "asset",
      name: assets[0].name,
      rate: assets[0].roi,
      value: assets[0].value,
    });
  }

  currentData.surplusAllocations = allocations;

  container.innerHTML = "";

  if (allocations.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-sm text-gray-500 dark:text-gray-400 italic">
        Add debts or assets to see automatic surplus allocation.
      </div>
    `;
  } else {
    allocations.forEach((allocation, index) => {
      const isAsset = allocation.targetType === "asset";
      const row = document.createElement("div");

      const borderColor = isAsset
        ? "border-blue-200 dark:border-blue-700"
        : "border-red-200 dark:border-red-700";

      row.className = `flex items-center gap-3 p-2 bg-white dark:bg-gray-700 rounded-lg border ${borderColor}`;

      const priorityBadge = document.createElement("div");
      if (isAsset) {
        priorityBadge.className =
          "flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold";
      } else {
        priorityBadge.className =
          "flex-shrink-0 w-6 h-6 flex items-center justify-center bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-full text-xs font-bold";
      }
      priorityBadge.textContent = index + 1;
      row.appendChild(priorityBadge);

      const details = document.createElement("div");
      details.className = "flex-1 min-w-0";

      const nameSpan = document.createElement("span");
      nameSpan.className =
        "text-sm font-medium text-gray-800 dark:text-gray-200 truncate block";
      nameSpan.textContent = allocation.name;
      details.appendChild(nameSpan);

      const infoSpan = document.createElement("span");
      infoSpan.className = "text-xs text-gray-500 dark:text-gray-400";
      infoSpan.textContent = `${formatCurrency(
        allocation.value
      )} @ ${formatPercent(allocation.rate)} ${isAsset ? "ROI" : "APR"}`;
      details.appendChild(infoSpan);

      row.appendChild(details);

      const typeIndicator = document.createElement("span");
      typeIndicator.className = "flex-shrink-0 text-xs px-2 py-0.5 rounded";
      if (isAsset) {
        typeIndicator.className +=
          " bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400";
        typeIndicator.textContent = "Invest";
      } else {
        typeIndicator.className +=
          " bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400";
        typeIndicator.textContent = "Pay off";
      }
      row.appendChild(typeIndicator);

      container.appendChild(row);
    });
  }
}

export function renderDeficitAllocations(currentData) {
  const container = document.getElementById("deficit-allocations-list");
  if (!container) return;

  const assets = (currentData.assets || [])
    .filter((a) => a.roi !== undefined)
    .sort((a, b) => (a.roi || 0) - (b.roi || 0));

  const allocations = [];

  for (const asset of assets) {
    allocations.push({
      id: asset.id,
      targetId: asset.id,
      targetType: "asset",
      name: asset.name,
      rate: asset.roi,
      value: asset.value,
    });
  }

  currentData.deficitAllocations = allocations;

  container.innerHTML = "";

  if (allocations.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-sm text-gray-500 dark:text-gray-400 italic">
        Add assets to see deficit liquidation order.
      </div>
    `;
  } else {
    allocations.forEach((allocation, index) => {
      const row = document.createElement("div");

      row.className = `flex items-center gap-3 p-2 bg-white dark:bg-gray-700 rounded-lg border border-amber-200 dark:border-amber-700`;

      const priorityBadge = document.createElement("div");
      priorityBadge.className =
        "flex-shrink-0 w-6 h-6 flex items-center justify-center bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 rounded-full text-xs font-bold";
      priorityBadge.textContent = index + 1;
      row.appendChild(priorityBadge);

      const details = document.createElement("div");
      details.className = "flex-1 min-w-0";

      const nameSpan = document.createElement("span");
      nameSpan.className =
        "text-sm font-medium text-gray-800 dark:text-gray-200 truncate block";
      nameSpan.textContent = allocation.name;
      details.appendChild(nameSpan);

      const infoSpan = document.createElement("span");
      infoSpan.className = "text-xs text-gray-500 dark:text-gray-400";
      infoSpan.textContent = `${formatCurrency(
        allocation.value
      )} @ ${formatPercent(allocation.rate)} ROI`;
      details.appendChild(infoSpan);

      row.appendChild(details);

      const typeIndicator = document.createElement("span");
      typeIndicator.className =
        "flex-shrink-0 text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400";
      typeIndicator.textContent = "Liquidate";
      row.appendChild(typeIndicator);

      container.appendChild(row);
    });
  }
}

export function updateSurplusTotalStatus(currentData, renderTableCallback) {
  const totalIncome = (currentData.income || []).reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );
  const totalExpenses = (currentData.expenses || []).reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const surplus = totalIncome - totalExpenses;

  const possibleIds = [
    "surplus-total",
    "surplus-total-amount",
    "surplus-amount",
    "surplus-status",
    "surplus-summary",
  ];

  possibleIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    if (id === "surplus-status" || id === "surplus-summary") {
      el.textContent = `${
        surplus >= 0 ? "Surplus" : "Deficit"
      }: ${formatCurrency(surplus)}`;
      el.classList.remove("text-green-600", "text-red-600");
      el.classList.add(surplus >= 0 ? "text-green-600" : "text-red-600");
    } else {
      el.textContent = formatCurrency(surplus);
    }
  });

  if (renderTableCallback) {
    try {
      renderTableCallback("income");
    } catch (err) {
      console.warn(
        "updateSurplusTotalStatus: failed to re-render income table",
        err
      );
    }
  }
}
