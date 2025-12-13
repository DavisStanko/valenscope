// @ts-nocheck
"use client";

import {
  formatCurrency,
  formatPercent,
  parseNumberSafe,
  handleEnterKey,
  limitInputLength,
  MAX_INPUT_LENGTHS,
} from "@/lib/core/utils";

let dragState = {
  draggedRow: null,
  draggedSection: null,
  draggedId: null,
  placeholder: null,
};

function handleDragStart(e, section, id) {
  dragState.draggedRow = e.target.closest("tr");
  dragState.draggedSection = section;
  dragState.draggedId = id;

  dragState.placeholder = document.createElement("tr");
  dragState.placeholder.className =
    "bg-blue-100 dark:bg-blue-900/30 border-2 border-dashed border-blue-400 dark:border-blue-600";
  const cellCount = dragState.draggedRow.children.length;
  const td = document.createElement("td");
  td.colSpan = cellCount;
  td.className = "py-2 px-4";
  td.innerHTML = "&nbsp;";
  dragState.placeholder.appendChild(td);

  setTimeout(() => {
    if (dragState.draggedRow) {
      dragState.draggedRow.classList.add("opacity-50");
    }
  }, 0);

  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", id);
}

function handleDragOver(e, section) {
  e.preventDefault();
  if (dragState.draggedSection !== section) return;

  e.dataTransfer.dropEffect = "move";

  const tbody = e.currentTarget;
  const rows = Array.from(tbody.querySelectorAll("tr[data-id]"));
  const mouseY = e.clientY;

  let targetRow = null;
  let insertBefore = true;

  for (const row of rows) {
    if (row === dragState.draggedRow || row === dragState.placeholder) continue;
    const rect = row.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (mouseY < midY) {
      targetRow = row;
      insertBefore = true;
      break;
    } else {
      targetRow = row;
      insertBefore = false;
    }
  }

  if (targetRow) {
    if (insertBefore) {
      tbody.insertBefore(dragState.placeholder, targetRow);
    } else {
      tbody.insertBefore(dragState.placeholder, targetRow.nextSibling);
    }
  } else if (
    rows.length === 0 ||
    (rows.length === 1 && rows[0] === dragState.draggedRow)
  ) {
    tbody.appendChild(dragState.placeholder);
  }
}

function handleDragLeave(e) {
  if (
    !e.currentTarget.contains(e.relatedTarget) &&
    dragState.placeholder &&
    dragState.placeholder.parentNode
  ) {
    dragState.placeholder.remove();
  }
}

function handleDrop(e, section, currentData, updateDataCallback) {
  e.preventDefault();
  if (dragState.draggedSection !== section) return;

  const tbody = e.currentTarget;

  if (dragState.draggedRow) {
    dragState.draggedRow.classList.remove("opacity-50");
  }

  if (dragState.placeholder && dragState.placeholder.parentNode) {
    tbody.insertBefore(dragState.draggedRow, dragState.placeholder);
    dragState.placeholder.remove();
  }

  const newOrder = Array.from(tbody.querySelectorAll("tr[data-id]")).map(
    (row) => row.dataset.id
  );
  const reorderedItems = newOrder
    .map((id) => currentData[section].find((item) => item.id === id))
    .filter(Boolean);

  if (reorderedItems.length === currentData[section].length) {
    currentData[section] = reorderedItems;
    if (updateDataCallback) {
      updateDataCallback({ [section]: currentData[section] });
    }
  }

  dragState.draggedRow = null;
  dragState.draggedSection = null;
  dragState.draggedId = null;
  dragState.placeholder = null;
}

function handleDragEnd(e) {
  if (dragState.draggedRow) {
    dragState.draggedRow.classList.remove("opacity-50");
  }
  if (dragState.placeholder && dragState.placeholder.parentNode) {
    dragState.placeholder.remove();
  }
  dragState.draggedRow = null;
  dragState.draggedSection = null;
  dragState.draggedId = null;
  dragState.placeholder = null;
}

export function createRow(item, section, callbacks = {}) {
  const {
    handleEdit,
    handleBlur,
    deleteItem,
    currentData,
    updateDataCallback,
    updateProjectionCallback,
    renderTableCallback,
  } = callbacks;

  const tr = document.createElement("tr");
  tr.className =
    "border-b dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50";
  tr.dataset.id = item.id;
  tr.draggable = true;

  tr.addEventListener("dragstart", (e) => {
    if (
      e.target.contentEditable === "true" ||
      e.target.tagName === "SELECT" ||
      e.target.tagName === "BUTTON"
    ) {
      e.preventDefault();
      return;
    }
    handleDragStart(e, section, item.id);
  });
  tr.addEventListener("dragend", handleDragEnd);

  const tdDrag = document.createElement("td");
  tdDrag.className =
    "py-2 px-2 text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing";
  tdDrag.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
    </svg>
  `;
  tr.appendChild(tdDrag);

  const tdName = document.createElement("td");
  tdName.className =
    "py-2 px-4 whitespace-nowrap font-medium cursor-text text-gray-900 dark:text-gray-100";
  tdName.textContent = item.name;
  tdName.contentEditable = true;
  tdName.addEventListener("input", (e) => {
    limitInputLength(e, MAX_INPUT_LENGTHS.name);
    if (handleEdit) handleEdit(e, section, item.id, "name");
  });
  tdName.addEventListener("blur", (e) => {
    if (handleBlur) handleBlur(e, section, item.id, "name");
  });
  tdName.addEventListener("keydown", handleEnterKey);
  tr.appendChild(tdName);

  const tdValue = document.createElement("td");
  tdValue.className =
    "py-2 px-4 text-right cursor-text tabular-nums text-gray-900 dark:text-gray-100";

  if (section === "assets" || section === "debts") {
    tdValue.textContent = formatCurrency(item.value);
  } else {
    tdValue.textContent = formatCurrency(item.amount);
  }
  tdValue.contentEditable = true;
  tdValue.addEventListener("blur", (e) => {
    if (handleBlur) {
      handleBlur(
        e,
        section,
        item.id,
        section === "assets" || section === "debts" ? "value" : "amount"
      );
    }
  });
  tdValue.addEventListener("input", (e) => {
    limitInputLength(e, MAX_INPUT_LENGTHS.amount);
    if (handleEdit) {
      handleEdit(
        e,
        section,
        item.id,
        section === "assets" || section === "debts" ? "value" : "amount"
      );
    }
  });
  tdValue.addEventListener("keydown", handleEnterKey);
  tr.appendChild(tdValue);

  if (section === "income") {
    const tdContinue = document.createElement("td");
    tdContinue.className = "py-2 px-4 text-center";

    const select = document.createElement("select");
    select.className =
      "px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100";

    const options = [
      { value: "stops", label: "Stops after retirement" },
      { value: "continues", label: "Continues through retirement" },
      { value: "starts", label: "Starts at retirement" },
    ];

    const currentBehavior =
      item.retirementBehavior ||
      (item.continueAfterRetirement ? "continues" : "stops");

    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === currentBehavior) o.selected = true;
      select.appendChild(o);
    }

    select.addEventListener("change", (e) => {
      const newBehavior = e.target.value;
      if (currentData && currentData.income) {
        currentData.income = (currentData.income || []).map((inc) =>
          inc.id === item.id ? { ...inc, retirementBehavior: newBehavior } : inc
        );
        if (updateDataCallback) {
          updateDataCallback({ income: currentData.income });
        }
        if (updateProjectionCallback) {
          updateProjectionCallback();
        }
        if (renderTableCallback) {
          renderTableCallback("income");
        }
      }
    });

    tdContinue.appendChild(select);
    tr.appendChild(tdContinue);
  }

  if (section === "assets") {
    const tdROI = document.createElement("td");
    tdROI.className =
      "py-2 px-4 text-right cursor-text tabular-nums text-gray-900 dark:text-gray-100";
    tdROI.textContent = formatPercent(item.roi);
    tdROI.contentEditable = true;
    tdROI.addEventListener("blur", (e) => {
      if (handleBlur) handleBlur(e, section, item.id, "roi");
    });
    tdROI.addEventListener("input", (e) => {
      limitInputLength(e, MAX_INPUT_LENGTHS.roi);
      if (handleEdit) handleEdit(e, section, item.id, "roi");
    });
    tdROI.addEventListener("keydown", handleEnterKey);
    tr.appendChild(tdROI);
  }

  if (section === "debts") {
    const tdAPR = document.createElement("td");
    tdAPR.className =
      "py-2 px-4 text-right cursor-text tabular-nums text-gray-900 dark:text-gray-100";
    tdAPR.textContent = formatPercent(item.apr);
    tdAPR.contentEditable = true;
    tdAPR.addEventListener("blur", (e) => {
      if (handleBlur) handleBlur(e, section, item.id, "apr");
    });
    tdAPR.addEventListener("input", (e) => {
      limitInputLength(e, MAX_INPUT_LENGTHS.apr);
      if (handleEdit) handleEdit(e, section, item.id, "apr");
    });
    tdAPR.addEventListener("keydown", handleEnterKey);
    tr.appendChild(tdAPR);
  }

  const tdActions = document.createElement("td");
  tdActions.className = "py-2 px-4 text-right";
  const deleteBtn = document.createElement("button");
  deleteBtn.className =
    "text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition delete-btn";
  deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 10-2 0v6a1 1 0 102 0V8z" clip-rule="evenodd" />
        </svg>
    `;
  deleteBtn.addEventListener("click", () => {
    if (deleteItem) deleteItem(section, item.id);
  });
  tdActions.appendChild(deleteBtn);
  tr.appendChild(tdActions);

  return tr;
}

export function renderTable(section, currentData, callbacks = {}) {
  const { updateDataCallback } = callbacks;

  const tbody = document.getElementById(`${section}-tbody`);
  if (!tbody) return;

  const activeElement = document.activeElement;
  if (
    activeElement &&
    activeElement.contentEditable === "true" &&
    tbody.contains(activeElement)
  ) {
    return;
  }

  tbody.innerHTML = "";

  const itemsToRender = currentData[section] || [];

  itemsToRender.forEach((item) => {
    tbody.appendChild(createRow(item, section, callbacks));
  });

  if (!tbody.dataset.dragInitialized) {
    tbody.addEventListener("dragover", (e) => handleDragOver(e, section));
    tbody.addEventListener("dragleave", handleDragLeave);
    tbody.addEventListener("drop", (e) =>
      handleDrop(e, section, currentData, updateDataCallback)
    );
    tbody.dataset.dragInitialized = "true";
  }
}

export function addItem(section, currentData, callbacks = {}) {
  const { updateDataCallback, renderTableCallback, renderAllocationsCallback } =
    callbacks;

  let newItem;

  if (section === "assets") {
    newItem = {
      id: crypto.randomUUID(),
      name: "New Asset",
      value: 0.0,
      roi: 0.0,
    };
  } else if (section === "debts") {
    newItem = {
      id: crypto.randomUUID(),
      name: "New Debt",
      value: 0.0,
      apr: 0.0,
    };
  } else if (section === "income") {
    newItem = {
      id: crypto.randomUUID(),
      name: "New Income",
      amount: 0.0,
      retirementBehavior: "stops",
    };
  } else {
    newItem = {
      id: crypto.randomUUID(),
      name: "New Expense",
      amount: 0.0,
    };
  }

  currentData[section].push(newItem);

  if (renderTableCallback) {
    renderTableCallback(section);
  }
  if (updateDataCallback) {
    updateDataCallback({ [section]: currentData[section] });
  }

  if (
    (section === "assets" || section === "debts") &&
    renderAllocationsCallback
  ) {
    renderAllocationsCallback();
  }
}

export function deleteItem(section, id, currentData, callbacks = {}) {
  const { updateDataCallback, renderTableCallback, renderAllocationsCallback } =
    callbacks;

  currentData[section] = currentData[section].filter((item) => item.id !== id);

  if (renderTableCallback) {
    renderTableCallback(section);
  }
  if (updateDataCallback) {
    updateDataCallback({ [section]: currentData[section] });
  }

  if (
    (section === "assets" || section === "debts") &&
    renderAllocationsCallback
  ) {
    renderAllocationsCallback();
  }
}
