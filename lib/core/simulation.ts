// @ts-nocheck

import { parseNumberSafe } from "./utils";

export function simulateMonthByMonth(data, months, returnFullHistory = false) {
  const assets = data.assets || [];
  const debts = data.debts || [];
  const income = data.income || [];
  const expenses = data.expenses || [];
  const allocations = data.surplusAllocations || [];
  const retirementYears = data.retirementYears || 0;
  const retirementMonths = retirementYears * 12;

  const totalIncome = income.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );
  const totalExpenses = expenses.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );
  const netMonthlyFlow = totalIncome - totalExpenses;

  let assetBalances = {};
  assets.forEach((asset) => {
    assetBalances[asset.id] = parseFloat(asset.value) || 0;
  });

  let debtBalances = {};
  debts.forEach((debt) => {
    debtBalances[debt.id] = parseFloat(debt.value) || 0;
  });

  const debtPayoffEvents = {};
  let financialIndependenceMonth = null;
  let accumulatedCash = 0;
  const history = returnFullHistory ? [] : null;

  for (let month = 0; month <= months; month++) {
    if (returnFullHistory) {
      const totalAssets = Object.values(assetBalances).reduce(
        (sum, val) => sum + val,
        0
      );
      const totalDebts = Object.values(debtBalances).reduce(
        (sum, val) => sum + val,
        0
      );
      history.push({
        month,
        totalAssets: totalAssets - totalDebts,
        totalNetWorth: totalAssets - totalDebts + accumulatedCash,
      });
    }

    if (month === months) break;

    const isRetired = month >= retirementMonths;

    const totalIncomeThisMonth = income.reduce((sum, item) => {
      const amt = parseFloat(item.amount) || 0;
      const behavior =
        item.retirementBehavior ||
        (item.continueAfterRetirement ? "continues" : "stops");

      if (isRetired) {
        return (
          sum + (behavior === "continues" || behavior === "starts" ? amt : 0)
        );
      }
      return sum + (behavior === "continues" || behavior === "stops" ? amt : 0);
    }, 0);

    const monthlyFlow = totalIncomeThisMonth - totalExpenses;

    assets.forEach((asset) => {
      const roi = parseFloat(asset.roi) || 0;
      const monthlyRate = roi / 12;
      assetBalances[asset.id] = assetBalances[asset.id] * (1 + monthlyRate);
    });

    debts.forEach((debt) => {
      const apr = parseFloat(debt.apr) || 0;
      const monthlyRate = apr / 12;
      debtBalances[debt.id] = debtBalances[debt.id] * (1 + monthlyRate);
    });

    let surplusThisMonth = monthlyFlow;

    if (surplusThisMonth > 0) {
      for (const allocation of allocations) {
        if (surplusThisMonth <= 0) break;

        if (allocation.targetType === "debt") {
          const debt = debts.find((d) => d.id === allocation.targetId);
          if (!debt) continue;

          const currentBalance = debtBalances[debt.id];
          if (currentBalance > 0) {
            const actualPayment = Math.min(surplusThisMonth, currentBalance);
            debtBalances[debt.id] = currentBalance - actualPayment;
            surplusThisMonth -= actualPayment;

            if (debtBalances[debt.id] <= 0.01 && !debtPayoffEvents[debt.id]) {
              debtPayoffEvents[debt.id] = {
                month: month + 1,
                name: debt.name,
              };
            }
          }
        } else if (allocation.targetType === "asset") {
          const asset = assets.find((a) => a.id === allocation.targetId);
          if (!asset) continue;
          assetBalances[asset.id] = assetBalances[asset.id] + surplusThisMonth;
          surplusThisMonth = 0;
        }
      }
    }

    if (surplusThisMonth < 0) {
      let deficitToCover = -surplusThisMonth;
      const deficitAllocations = data.deficitAllocations || [];

      for (const allocation of deficitAllocations) {
        if (deficitToCover <= 0) break;
        const assetBalance = assetBalances[allocation.targetId];
        if (assetBalance > 0) {
          const amountToLiquidate = Math.min(deficitToCover, assetBalance);
          assetBalances[allocation.targetId] -= amountToLiquidate;
          deficitToCover -= amountToLiquidate;
        }
      }

      surplusThisMonth = -deficitToCover;
    }

    accumulatedCash += surplusThisMonth;

    if (financialIndependenceMonth === null) {
      const monthlyPassiveIncome = assets.reduce((sum, asset) => {
        const balance = assetBalances[asset.id] || 0;
        const roi = parseFloat(asset.roi) || 0;
        return sum + (balance * roi) / 12;
      }, 0);

      const totalRemainingDebt = Object.values(debtBalances).reduce(
        (sum, val) => sum + val,
        0
      );

      if (monthlyPassiveIncome >= totalExpenses && totalRemainingDebt < 0.01) {
        financialIndependenceMonth = month + 1;
      }
    }
  }

  const finalAssetTotal = Object.values(assetBalances).reduce(
    (sum, val) => sum + val,
    0
  );
  const finalDebtTotal = Object.values(debtBalances).reduce(
    (sum, val) => sum + val,
    0
  );
  const finalNetWorth = finalAssetTotal - finalDebtTotal + accumulatedCash;

  return {
    netMonthlyFlow,
    assetBalances,
    debtBalances,
    accumulatedCash,
    totalAssets: finalAssetTotal - finalDebtTotal,
    projectedNetWorth: finalNetWorth,
    history,
    debtPayoffEvents,
    retirementMonth: retirementMonths,
    financialIndependenceMonth,
  };
}

export function calculateProjection(data, months = 12) {
  const result = simulateMonthByMonth(data, months);

  const assets = data.assets || [];
  const debts = data.debts || [];

  const annualAssetReturn = assets.reduce((sum, item) => {
    const value = parseFloat(item.value) || 0;
    const roi = parseFloat(item.roi) || 0;
    return sum + value * roi;
  }, 0);

  const annualDebtInterest = debts.reduce((sum, item) => {
    const value = parseFloat(item.value) || 0;
    const apr = parseFloat(item.apr) || 0;
    return sum + value * apr;
  }, 0);

  return {
    netMonthlyFlow: result.netMonthlyFlow,
    annualAssetReturn,
    annualDebtInterest,
    projectedNetWorth: result.projectedNetWorth,
  };
}

export function calculateProjectionOverTime(data, months) {
  const assets = data.assets || [];
  const result = simulateMonthByMonth(data, months, true);
  const historyData = result.history || [];
  const debtPayoffEvents = result.debtPayoffEvents || {};
  const retirementMonth = result.retirementMonth;
  const financialIndependenceMonth = result.financialIndependenceMonth;

  if (historyData.length === 0) {
    return {
      labels: [],
      netWorthData: [],
      assetsOnlyData: [],
      debtPayoffAnnotations: [],
      retirementAnnotation: null,
      netZeroAnnotation: null,
      financialIndependenceAnnotation: null,
      wealthMilestoneAnnotations: [],
    };
  }

  const startDate = new Date();

  let step = 1;
  if (months > 120) step = 6;
  else if (months > 60) step = 3;
  else if (months > 24) step = 2;

  const labels = [];
  const netWorthData = [];
  const assetsOnlyData = [];
  const monthToLabelIndex = {};

  for (let pointIndex = 0; pointIndex * step <= months; pointIndex++) {
    const monthNum = pointIndex * step;
    if (monthNum > months) break;
    monthToLabelIndex[monthNum] = pointIndex;
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + monthNum);

    if (months <= 12) {
      labels.push(
        date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      );
    } else if (months <= 60) {
      labels.push(
        date.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      );
    } else {
      labels.push(
        date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      );
    }

    const dataPoint =
      historyData[monthNum] || historyData[historyData.length - 1];
    if (dataPoint) {
      assetsOnlyData.push(dataPoint.totalAssets);
      netWorthData.push(dataPoint.totalNetWorth);
    }
  }

  const debtPayoffAnnotations = [];
  for (const debtId in debtPayoffEvents) {
    const event = debtPayoffEvents[debtId];
    let closestIndex = 0;
    let closestMonth = 0;
    for (const monthStr in monthToLabelIndex) {
      const m = parseInt(monthStr);
      if (m <= event.month && m > closestMonth) {
        closestMonth = m;
        closestIndex = monthToLabelIndex[m];
      }
    }
    if (event.month <= months) {
      debtPayoffAnnotations.push({
        debtId,
        name: event.name,
        month: event.month,
        labelIndex: closestIndex,
        netWorthValue: netWorthData[closestIndex],
      });
    }
  }

  let retirementAnnotation = null;
  if (retirementMonth !== null && retirementMonth <= months) {
    let closestIndex = 0;
    let closestMonth = 0;
    for (const monthStr in monthToLabelIndex) {
      const m = parseInt(monthStr);
      if (m <= retirementMonth && m > closestMonth) {
        closestMonth = m;
        closestIndex = monthToLabelIndex[m];
      }
    }
    retirementAnnotation = { month: retirementMonth, labelIndex: closestIndex };
  }

  let netZeroAnnotation = null;
  if (netWorthData.length > 0 && netWorthData[0] < 0) {
    for (let i = 1; i < netWorthData.length; i++) {
      if (netWorthData[i] >= 0) {
        netZeroAnnotation = { labelIndex: i };
        break;
      }
    }
  }

  let financialIndependenceAnnotation = null;
  if (financialIndependenceMonth && financialIndependenceMonth <= months) {
    let closestIndex = 0;
    let closestMonth = 0;
    for (const monthStr in monthToLabelIndex) {
      const m = parseInt(monthStr);
      if (m <= financialIndependenceMonth && m > closestMonth) {
        closestMonth = m;
        closestIndex = monthToLabelIndex[m];
      }
    }
    financialIndependenceAnnotation = {
      month: financialIndependenceMonth,
      labelIndex: closestIndex,
    };
  }

  const wealthMilestones = [
    {
      threshold: 100000,
      label: "📊 Top 50%",
      color: "rgba(59, 130, 246, 0.9)",
    },
    {
      threshold: 975000,
      label: "💎 Top 10%",
      color: "rgba(99, 102, 241, 0.9)",
    },
    {
      threshold: 11500000,
      label: "👑 Top 1%",
      color: "rgba(139, 92, 246, 0.9)",
    },
    {
      threshold: 47000000,
      label: "🏆 Top 0.1%",
      color: "rgba(168, 85, 247, 0.9)",
    },
  ];

  const wealthMilestoneAnnotations = [];
  for (const milestone of wealthMilestones) {
    if (netWorthData.length > 0 && netWorthData[0] < milestone.threshold) {
      for (let i = 1; i < netWorthData.length; i++) {
        if (netWorthData[i] >= milestone.threshold) {
          wealthMilestoneAnnotations.push({
            labelIndex: i,
            label: milestone.label,
            color: milestone.color,
          });
          break;
        }
      }
    }
  }

  return {
    labels,
    netWorthData,
    assetsOnlyData,
    debtPayoffAnnotations,
    retirementAnnotation,
    netZeroAnnotation,
    financialIndependenceAnnotation,
    wealthMilestoneAnnotations,
  };
}
