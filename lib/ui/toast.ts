// @ts-nocheck
"use client";

export function createToastContainer() {
  const container = document.createElement("div");
  container.id = "toast-container";
  container.className =
    "fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none";
  container.style.width = "360px";
  document.body.appendChild(container);
  return container;
}

export function showToast(message, type = "info") {
  const toastContainer =
    document.getElementById("toast-container") || createToastContainer();

  const toast = document.createElement("div");
  toast.className = `toast-notification ${type} transform translate-y-full transition-transform duration-300`;

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warning: "⚠",
  };

  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    warning: "bg-yellow-500",
  };

  const inner = document.createElement("div");
  inner.className = `flex items-center gap-3 ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg pointer-events-auto`;

  const iconSpan = document.createElement("span");
  iconSpan.className = "text-lg font-bold";
  iconSpan.textContent = icons[type] || "";

  const msgSpan = document.createElement("span");
  msgSpan.className = "text-sm";
  msgSpan.textContent = message == null ? "" : String(message);

  inner.appendChild(iconSpan);
  inner.appendChild(msgSpan);
  toast.appendChild(inner);

  toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.remove("translate-y-full"), 10);

  setTimeout(() => {
    toast.classList.add("translate-y-full");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
