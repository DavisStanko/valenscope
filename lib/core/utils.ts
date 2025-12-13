// @ts-nocheck
"use client";

export const MAX_INPUT_LENGTHS = {
  name: 60,
  amount: 20,
  roi: 10,
  apr: 10,
  email: 254,
  password: 128,
  retirementYears: 3,
};

export const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value
  );

export const formatPercent = (value) => (value * 100).toFixed(2) + "%";

export function formatCurrencyShort(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value)) return "";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Number(value));

  const units = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];

  for (const u of units) {
    if (abs >= u.value) {
      const shortVal = (abs / u.value).toFixed(decimals).replace(/\.0+$/, "");
      return `${sign}$${shortVal}${u.suffix}`;
    }
  }

  return sign + formatCurrency(abs);
}

export function parseNumberSafe(text, asPercentage = false) {
  if (text === null || text === undefined) return 0;
  const s = String(text);
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return 0;
  const n = parseFloat(m[0]);
  if (!isFinite(n) || Number.isNaN(n)) return 0;
  return asPercentage ? n / 100 : n;
}

export function extractEmojis(text) {
  try {
    const matches = text.match(/\p{Extended_Pictographic}/gu);
    if (matches && matches.length > 0) return matches.join("");
  } catch (err) {
    const fallback = text.replace(/[\w\s\d\p{P}\p{S}]/gu, "");
    if (fallback) return fallback;
  }
  return null;
}

export function pickEmoji(label, defaultEmoji) {
  const emojis = extractEmojis(label || "");
  return emojis || defaultEmoji;
}

export function debounce(fn, wait = 150) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function handleEnterKey(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  }
}

export function limitInputLength(e, maxLength) {
  const t = e.target;

  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
    if (t.value.length > maxLength) {
      const cursor = t.selectionStart || t.value.length;
      t.value = t.value.substring(0, maxLength);
      try {
        t.setSelectionRange(
          Math.min(cursor, maxLength),
          Math.min(cursor, maxLength)
        );
      } catch (err) {}
    }
    return;
  }

  const text = t.textContent || "";
  if (text.length > maxLength) {
    const selection = window.getSelection();
    let cursorPosition = 0;
    try {
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        cursorPosition = range.startOffset;
      }
    } catch (err) {
      cursorPosition = text.length;
    }

    const truncated = text.substring(0, maxLength);
    t.textContent = truncated;

    try {
      const newSelection = window.getSelection();
      const newRange = document.createRange();
      const textNode = t.firstChild || t;
      const newPosition = Math.min(cursorPosition, maxLength);
      newRange.setStart(textNode, newPosition);
      newRange.collapse(true);
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
    } catch (err) {}
  }
}

export function selectAllTextForEditable(el) {
  if (!el) return;
  const tag = el.tagName && el.tagName.toUpperCase();
  try {
    if (tag === "INPUT" || tag === "TEXTAREA") {
      el.select && el.select();
    } else if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (err) {
    console.warn("selectAll failed", err);
  }
}
