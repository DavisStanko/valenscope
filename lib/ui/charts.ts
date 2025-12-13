// @ts-nocheck
"use client";

import Chart from "chart.js/auto";
import annotationPlugin from "chartjs-plugin-annotation";
import {
  formatCurrency,
  formatCurrencyShort,
  pickEmoji,
} from "@/lib/core/utils";
import { calculateProjectionOverTime } from "@/lib/core/simulation";

Chart.register(annotationPlugin);

let projectionChart = null;

export function destroyChart() {
  if (projectionChart) {
    projectionChart.destroy();
    projectionChart = null;
  }
}

let currentLegendState = {
  debtPayoff: false,
  retirement: false,
  netZero: false,
  fi: false,
  top50: false,
  top10: false,
  top1: false,
  top01: false,
};

function adjustPointVisibility(chart) {
  try {
    if (!chart || !chart.scales || !chart.data) return;

    const xScale = chart.scales.x;
    if (!xScale || !xScale.ticks) return;

    const labels = chart.data.labels.map((l) => String(l));
    const radiusArray = labels.map(() => 0);

    const normalized = (s) =>
      String(s)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
    const normLabels = labels.map((l) => normalized(l));

    const discovered = new Set();

    xScale.ticks.forEach((t) => {
      if (typeof t.value === "number" && Number.isFinite(t.value)) {
        const idx = Math.round(t.value);
        if (idx >= 0 && idx < labels.length) discovered.add(idx);
        return;
      }

      if (typeof t.index === "number" && Number.isFinite(t.index)) {
        const idx = Math.round(t.index);
        if (idx >= 0 && idx < labels.length) discovered.add(idx);
        return;
      }

      const tl = t.label != null ? String(t.label) : String(t.value);
      const nt = normalized(tl);
      for (let i = 0; i < normLabels.length; i++) {
        if (nt && (normLabels[i].includes(nt) || nt.includes(normLabels[i]))) {
          discovered.add(i);
          break;
        }
      }
    });

    if (discovered.size === 0) {
      try {
        xScale.ticks.forEach((t) => {
          const tickPixel = t && (t.x || t.pos || t.px || t.pixel || null);
          if (tickPixel == null) return;

          let bestIdx = -1;
          let bestDist = Infinity;
          for (let i = 0; i < labels.length; i++) {
            let px;
            try {
              px = xScale.getPixelForValue(undefined, i);
            } catch (e) {
              try {
                px = xScale.getPixelForTick ? xScale.getPixelForTick(i) : null;
              } catch (err) {
                px = null;
              }
            }
            if (px == null) continue;
            const d = Math.abs(px - tickPixel);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
          if (bestIdx >= 0) discovered.add(bestIdx);
        });
      } catch (err) {}
    }

    if (discovered.size === 0) {
      const step = Math.max(1, Math.round(labels.length / 12));
      for (let i = 0; i < labels.length; i += step) discovered.add(i);
    }

    discovered.forEach((i) => {
      if (i >= 0 && i < radiusArray.length) radiusArray[i] = 4;
    });

    if (chart.data.datasets && chart.data.datasets[0]) {
      chart.data.datasets[0].pointRadius = radiusArray;
      chart.update("none");
    }
  } catch (err) {
    console.error("adjustPointVisibility error:", err);
  }
}

export function updateChartLegend(
  debtPayoffAnnotations,
  retirementAnnotation,
  netZeroAnnotation,
  financialIndependenceAnnotation,
  wealthMilestoneAnnotations
) {
  const milestoneLabels = wealthMilestoneAnnotations.map((m) => m.label);

  currentLegendState = {
    debtPayoff: debtPayoffAnnotations && debtPayoffAnnotations.length > 0,
    retirement: !!retirementAnnotation,
    netZero: !!netZeroAnnotation,
    fi: !!financialIndependenceAnnotation,
    top50: milestoneLabels.includes("📊 Top 50%"),
    top10: milestoneLabels.includes("💎 Top 10%"),
    top1: milestoneLabels.includes("👑 Top 1%"),
    top01: milestoneLabels.includes("🏆 Top 0.1%"),
  };

  applyLegendVisibility();
}

export function applyLegendVisibility() {
  const showAllToggle = document.getElementById("legend-show-all");
  const showAll = showAllToggle ? showAllToggle.checked : false;

  const setLegendVisibility = (id, activeOnGraph) => {
    const el = document.getElementById(id);
    if (el) {
      const visible = showAll || activeOnGraph;
      el.classList.toggle("hidden", !visible);
      el.classList.toggle("flex", visible);
      if (showAll && !activeOnGraph) {
        el.classList.add("opacity-40");
      } else {
        el.classList.remove("opacity-40");
      }
    }
  };

  setLegendVisibility("legend-debt-payoff", currentLegendState.debtPayoff);
  setLegendVisibility("legend-retirement", currentLegendState.retirement);
  setLegendVisibility("legend-net-zero", currentLegendState.netZero);
  setLegendVisibility("legend-fi", currentLegendState.fi);
  setLegendVisibility("legend-top50", currentLegendState.top50);
  setLegendVisibility("legend-top10", currentLegendState.top10);
  setLegendVisibility("legend-top1", currentLegendState.top1);
  setLegendVisibility("legend-top01", currentLegendState.top01);
}

export function updateChart(currentData, currentTimeRangeMonths) {
  const {
    labels,
    netWorthData,
    assetsOnlyData,
    debtPayoffAnnotations,
    retirementAnnotation,
    netZeroAnnotation,
    financialIndependenceAnnotation,
    wealthMilestoneAnnotations,
  } = calculateProjectionOverTime(currentData, currentTimeRangeMonths);

  const ctx = document.getElementById("projectionChart");

  if (!ctx) return;

  if (
    !labels ||
    labels.length === 0 ||
    !netWorthData ||
    netWorthData.length === 0
  ) {
    return;
  }

  const isDark = document.documentElement.classList.contains("dark");

  const labelPositions = [];
  const PROXIMITY_THRESHOLD = 3;
  const LABEL_HEIGHT = 24;

  const getYAdjust = (labelIndex) => {
    let maxOffset = -1;
    for (const pos of labelPositions) {
      if (Math.abs(pos.index - labelIndex) <= PROXIMITY_THRESHOLD) {
        maxOffset = Math.max(maxOffset, pos.yOffset);
      }
    }
    const newOffset = maxOffset + 1;
    labelPositions.push({ index: labelIndex, yOffset: newOffset });
    return -(newOffset * LABEL_HEIGHT);
  };

  const isSmallScreen = window.innerWidth <= 480;

  const annotations = {};
  debtPayoffAnnotations.forEach((event, index) => {
    const yAdjust = getYAdjust(event.labelIndex);
    let content;
    if (isSmallScreen) {
      content = String(index + 1);
    } else {
      content = `${event.name} paid off`;
    }

    annotations[`debtPayoff${index}`] = {
      type: "line",
      xMin: event.labelIndex,
      xMax: event.labelIndex,
      borderColor: "rgba(239, 68, 68, 0.7)",
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        display: true,
        content: content,
        position: "start",
        yAdjust: yAdjust,
        backgroundColor: "rgba(239, 68, 68, 0.8)",
        color: "#fff",
        font: {
          size: 11,
          weight: "bold",
        },
        padding: 4,
        borderRadius: 4,
      },
    };
  });

  if (retirementAnnotation) {
    const yAdjust = getYAdjust(retirementAnnotation.labelIndex);
    const retirementLabel = isSmallScreen
      ? pickEmoji("🏖️ Retirement", "🏖️")
      : "🏖️ Retirement";

    annotations["retirement"] = {
      type: "line",
      xMin: retirementAnnotation.labelIndex,
      xMax: retirementAnnotation.labelIndex,
      borderColor: "rgba(168, 85, 247, 0.7)",
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        display: true,
        content: retirementLabel,
        position: "start",
        yAdjust: yAdjust,
        backgroundColor: "rgba(168, 85, 247, 0.8)",
        color: "#fff",
        font: {
          size: 11,
          weight: "bold",
        },
        padding: 4,
        borderRadius: 4,
      },
    };
  }

  if (netZeroAnnotation) {
    const yAdjust = getYAdjust(netZeroAnnotation.labelIndex);
    const netZeroLabel = isSmallScreen
      ? pickEmoji("🎯 Net Zero", "🎯")
      : "🎯 Net Zero";

    annotations["netZero"] = {
      type: "line",
      xMin: netZeroAnnotation.labelIndex,
      xMax: netZeroAnnotation.labelIndex,
      borderColor: "rgba(34, 197, 94, 0.8)",
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        display: true,
        content: netZeroLabel,
        position: "start",
        yAdjust: yAdjust,
        backgroundColor: "rgba(34, 197, 94, 0.9)",
        color: "#fff",
        font: {
          size: 11,
          weight: "bold",
        },
        padding: 4,
        borderRadius: 4,
      },
    };
  }

  if (financialIndependenceAnnotation) {
    const yAdjust = getYAdjust(financialIndependenceAnnotation.labelIndex);
    const fiLabel = isSmallScreen
      ? pickEmoji("🌟 FI Achieved", "🌟")
      : "🌟 FI Achieved";

    annotations["financialIndependence"] = {
      type: "line",
      xMin: financialIndependenceAnnotation.labelIndex,
      xMax: financialIndependenceAnnotation.labelIndex,
      borderColor: "rgba(251, 191, 36, 0.9)",
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        display: true,
        content: fiLabel,
        position: "start",
        yAdjust: yAdjust,
        backgroundColor: "rgba(251, 191, 36, 0.9)",
        color: "#000",
        font: {
          size: 11,
          weight: "bold",
        },
        padding: 4,
        borderRadius: 4,
      },
    };
  }

  wealthMilestoneAnnotations.forEach((milestone, index) => {
    const yAdjust = getYAdjust(milestone.labelIndex);
    const milestoneLabel = isSmallScreen
      ? pickEmoji(milestone.label, "💰")
      : milestone.label;
    annotations[`wealthMilestone${index}`] = {
      type: "line",
      xMin: milestone.labelIndex,
      xMax: milestone.labelIndex,
      borderColor: milestone.color,
      borderWidth: 2,
      borderDash: [5, 5],
      label: {
        display: true,
        content: milestoneLabel,
        position: "start",
        yAdjust: yAdjust,
        backgroundColor: milestone.color,
        color: "#fff",
        font: {
          size: 11,
          weight: "bold",
        },
        padding: 4,
        borderRadius: 4,
      },
    };
  });

  if (projectionChart) {
    // Check if the chart's canvas is still connected to the DOM
    if (!projectionChart.canvas.isConnected) {
      projectionChart.destroy();
      projectionChart = null;
    }
  }

  if (projectionChart) {
    projectionChart.data.labels = labels;
    projectionChart.data.datasets[0].data = netWorthData;
    projectionChart.data.datasets[0].pointBackgroundColor = function (ctx) {
      const y = ctx.parsed && ctx.parsed.y;
      return typeof y === "number" && y < 0
        ? "rgb(239, 68, 68)"
        : "rgb(34, 197, 94)";
    };
    projectionChart.data.datasets[0].pointBorderColor =
      projectionChart.data.datasets[0].pointBackgroundColor;
    projectionChart.options.plugins.annotation.annotations = annotations;
    projectionChart.update();
    adjustPointVisibility(projectionChart);
  } else {
    projectionChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Net Worth",
            data: netWorthData,
            borderColor: "rgb(34, 197, 94)",
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            pointBackgroundColor: function (ctx) {
              const y = ctx.parsed && ctx.parsed.y;
              return typeof y === "number" && y < 0
                ? "rgb(239, 68, 68)"
                : "rgb(34, 197, 94)";
            },
            pointBorderColor: function (ctx) {
              const y = ctx.parsed && ctx.parsed.y;
              return typeof y === "number" && y < 0
                ? "rgb(239, 68, 68)"
                : "rgb(34, 197, 94)";
            },
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.1,
            fill: true,
            segment: {
              backgroundColor: (ctx) =>
                ctx.p0.parsed.y < 0 && ctx.p1.parsed.y < 0
                  ? "rgba(239, 68, 68, 0.1)"
                  : undefined,
              borderColor: (ctx) =>
                ctx.p0.parsed.y < 0 && ctx.p1.parsed.y < 0
                  ? "rgb(239, 68, 68)"
                  : undefined,
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          annotation: {
            annotations: annotations,
          },
          legend: {
            display: false,
          },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: function (context) {
                return (
                  context.dataset.label +
                  ": " +
                  formatCurrency(context.parsed.y)
                );
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            ticks: {
              callback: function (value) {
                return formatCurrencyShort(value);
              },
              color: isDark ? "#d1d5db" : "#6b7280",
            },
            grid: {
              color: isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.05)",
            },
          },
          x: {
            grid: {
              display: false,
            },
            ticks: {
              maxRotation: currentTimeRangeMonths <= 12 ? 45 : 90,
              minRotation: currentTimeRangeMonths <= 12 ? 0 : 45,
              color: isDark ? "#d1d5db" : "#6b7280",
            },
          },
        },
        interaction: {
          mode: "nearest",
          axis: "x",
          intersect: false,
        },
      },
    });
    adjustPointVisibility(projectionChart);
  }

  updateChartLegend(
    debtPayoffAnnotations,
    retirementAnnotation,
    netZeroAnnotation,
    financialIndependenceAnnotation,
    wealthMilestoneAnnotations
  );
}

export function updateChartTheme() {
  if (!projectionChart) return;

  const isDark = document.documentElement.classList.contains("dark");

  projectionChart.options.scales.y.grid.color = isDark
    ? "rgba(255, 255, 255, 0.15)"
    : "rgba(0, 0, 0, 0.05)";
  projectionChart.options.scales.y.ticks.color = isDark ? "#d1d5db" : "#6b7280";
  projectionChart.options.scales.x.ticks.color = isDark ? "#d1d5db" : "#6b7280";
  projectionChart.options.plugins.legend.labels = {
    color: isDark ? "#f3f4f6" : "#374151",
  };

  projectionChart.update();
}

export function getProjectionChart() {
  return projectionChart;
}
