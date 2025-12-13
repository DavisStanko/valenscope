import { useState } from 'react';

export default function CalculationFormulas() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8 transition-colors duration-200">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          📐 Calculation Formulas
        </h2>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-5 h-5 text-gray-500 dark:text-gray-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div className={`mt-6 ${isOpen ? 'block' : 'hidden'}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm text-gray-600 dark:text-gray-400">
          {/* Basic Calculations */}
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wide">
              Core Metrics
            </h4>
            <div className="space-y-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Net Monthly Flow
                </span>
                <p className="text-xs mt-0.5">= Total Income − Total Expenses</p>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Net Worth
                </span>
                <p className="text-xs mt-0.5">= Total Assets − Total Debts</p>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Monthly Asset Growth
                </span>
                <p className="text-xs mt-0.5">
                  = Asset Value × (Annual ROI ÷ 12)
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Monthly Debt Interest
                </span>
                <p className="text-xs mt-0.5">
                  = Debt Balance × (Annual APR ÷ 12)
                </p>
              </div>
            </div>
          </div>
          {/* Projection Logic */}
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wide">
              Monthly Projection Steps
            </h4>
            <div className="space-y-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
              <ol className="list-decimal list-inside text-xs space-y-1">
                <li>Apply ROI growth to all assets</li>
                <li>Apply APR interest to all debts</li>
                <li>Calculate monthly surplus (Income − Expenses)</li>
                <li>If surplus: Allocate to debts/assets by priority</li>
                <li>If deficit: Liquidate assets (lowest ROI first)</li>
                <li>Track remaining cash (positive or negative)</li>
              </ol>
            </div>
          </div>
          {/* Retirement */}
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wide">
              Retirement Simulation
            </h4>
            <div className="space-y-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Pre-Retirement
                </span>
                <p className="text-xs mt-0.5">
                  Monthly Flow = Income − Expenses<br />
                  <span className="text-gray-400 dark:text-gray-500">
                    If there is a surplus, it is allocated to debts/assets by
                    priority i.e., pay off debts in order of highest APR first,
                    then invest. If there is a deficit, assets are liquidated to
                    cover expenses (lowest ROI first).
                  </span>
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  Post-Retirement
                </span>
                <p className="text-xs mt-0.5">
                  Monthly Flow = Retirement Income − Expenses<br />
                  <span className="text-gray-400 dark:text-gray-500">
                    Income sources marked "Continues through retirement" and
                    "Starts at retirement" are included. If there is a surplus,
                    it is allocated to debts/assets by priority i.e., pay off
                    debts in order of highest APR first, then invest. If there
                    is a deficit, assets are liquidated to cover expenses
                    (lowest ROI first).
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* Limitations Disclaimer */}
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-600 dark:text-gray-300 mb-2">
            ⚠️ Limitations & Assumptions
          </p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>
              <strong>Volatility:</strong> Investments (e.g., real estate,
              stocks, crypto etc.) are volatile. Costs of borrowing are also
              volatile.
            </li>
            <li>
              <strong>No taxes:</strong> Capital gains, income tax, and
              investment tax drag are not modeled
            </li>
            <li>
              <strong>No inflation:</strong> $1M in 30 years won&apos;t have the same
              purchasing power as today
            </li>
            <li>
              <strong>Constant expenses:</strong> Assumes expenses stay fixed;
              doesn&apos;t account for lifestyle changes, healthcare costs, or
              emergencies
            </li>
            <li>
              <strong>Immediate reinvestment:</strong> ROI compounds monthly
              with no transaction cost or delays
            </li>
            <li>
              <strong>No sequence-of-returns risk:</strong> Market downturns
              early in retirement can devastate portfolios
            </li>
            <li>
              <strong>Simplified debt:</strong> Minimum payments, variable
              rates, and refinancing are not considered
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
