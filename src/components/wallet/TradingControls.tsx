'use client'

import React from 'react'

interface TradingControlsProps {
  tradingEnabled: boolean
  tradingBalance: number
  customAmount: string
  isTrading: boolean
  onCustomAmountChange: (amount: string) => void
  onEnableTradingWithAmount: (amount: number) => void
  onExecuteAutomatedTrade: () => void
  onDisableTrading: () => void
}

export function TradingControls({
  tradingEnabled,
  tradingBalance,
  customAmount,
  isTrading,
  onCustomAmountChange,
  onEnableTradingWithAmount,
  onExecuteAutomatedTrade,
  onDisableTrading
}: TradingControlsProps) {
  const handleEnableCustomAmount = () => {
    const amount = parseFloat(customAmount)
    if (amount > 0) {
      onEnableTradingWithAmount(amount)
      onCustomAmountChange('')
    }
  }

  return (
    <div className="bg-white/5 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-3">🤖 Trading Bot</h3>

      {!tradingEnabled ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-300">Authorize 24/7 automated trading (one-time signature required)</p>

          {/* Quick Amount Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => onEnableTradingWithAmount(1.0)}
              className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 font-semibold py-2 px-3 rounded-lg transition-all duration-300 text-sm"
            >
              1 SOL
            </button>
            <button
              onClick={() => onEnableTradingWithAmount(5.0)}
              className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 font-semibold py-2 px-3 rounded-lg transition-all duration-300 text-sm"
            >
              5 SOL
            </button>
            <button
              onClick={() => onEnableTradingWithAmount(10.0)}
              className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 font-semibold py-2 px-3 rounded-lg transition-all duration-300 text-sm"
            >
              10 SOL
            </button>
          </div>

          {/* Custom Amount Input */}
          <div className="space-y-2">
            <label className="text-xs text-gray-400">Custom Amount (SOL)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={customAmount}
                onChange={(e) => onCustomAmountChange(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.1"
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-400 text-sm focus:outline-none focus:border-green-400"
              />
              <button
                onClick={handleEnableCustomAmount}
                disabled={!customAmount || parseFloat(customAmount) <= 0}
                className="bg-green-500/20 hover:bg-green-500/30 disabled:bg-gray-500/20 disabled:text-gray-500 text-green-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300 text-sm"
              >
                🔐 Authorize
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Trading Status</span>
            <span className="text-green-400 font-semibold">✅ Enabled</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-300">Trading Balance</span>
            <span className="text-white font-semibold">{tradingBalance} SOL</span>
          </div>

          <button
            onClick={onExecuteAutomatedTrade}
            disabled={isTrading}
            className="w-full bg-orange-500/20 hover:bg-orange-500/30 disabled:bg-gray-500/20 disabled:text-gray-500 text-orange-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300 mb-2"
          >
            {isTrading ? '⏳ Executing Automated Trade...' : '🚀 AUTOMATED TRADE (10%)'}
          </button>

          <p className="text-xs text-gray-400 mb-2">🤖 Bot trades autonomously with your authorized {tradingBalance} SOL balance</p>

          <button
            onClick={onDisableTrading}
            className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300"
          >
            Disable Trading
          </button>
        </div>
      )}
    </div>
  )
}