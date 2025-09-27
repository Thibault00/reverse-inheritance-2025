'use client'

import React, { useEffect, useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

export function WalletConnection() {
  const { connected, publicKey, disconnect } = useWallet()
  const { connection } = useConnection()
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [tradingEnabled, setTradingEnabled] = useState(false)
  const [tradingBalance, setTradingBalance] = useState(0)
  const [customAmount, setCustomAmount] = useState('')
  const [isTrading, setIsTrading] = useState(false)
  const [lastTrade, setLastTrade] = useState<any>(null)

  // Fetch wallet balance when connected
  useEffect(() => {
    const fetchBalance = async () => {
      if (connected && publicKey) {
        setLoading(true)
        try {
          // Get balance from our backend API (which handles Solana calls)
          const balanceResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/balance/${publicKey.toString()}`)

          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json()
            setBalance(balanceData.balance)
          } else {
            // Fallback: Save wallet with 0 balance and let backend update it
            await saveWalletToBackend(publicKey.toString(), 0)
            setBalance(0)
          }
        } catch (error) {
          console.error('Error fetching balance:', error)
          // Fallback: Save wallet with 0 balance
          try {
            await saveWalletToBackend(publicKey.toString(), 0)
            setBalance(0)
          } catch (saveError) {
            console.error('Error saving wallet:', saveError)
            setBalance(null)
          }
        } finally {
          setLoading(false)
        }
      } else {
        setBalance(null)
      }
    }

    fetchBalance()
  }, [connected, publicKey])

  // Save wallet information to backend
  const saveWalletToBackend = async (address: string, balance: number) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address,
          balance,
          walletType: 'user',
          walletName: 'User Wallet'
        }),
      })

      if (!response.ok) {
        console.error('Failed to save wallet to backend')
      }
    } catch (error) {
      console.error('Error saving wallet:', error)
    }
  }

  const handleDisconnect = async () => {
    try {
      await disconnect()
      setBalance(null)
      setTradingEnabled(false)
      setTradingBalance(0)
      setCustomAmount('')
    } catch (error) {
      console.error('Error disconnecting wallet:', error)
    }
  }

  const handleEnableCustomAmount = () => {
    const amount = parseFloat(customAmount)
    if (amount > 0) {
      enableTrading(amount)
      setCustomAmount('')
    }
  }

  const enableTrading = async (amount: number) => {
    if (!publicKey) return

    try {
      // First, ensure wallet is saved to database
      await saveWalletToBackend(publicKey.toString(), balance || 0)

      // Then enable trading
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/enable-trading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: publicKey.toString(),
          tradingAmount: amount
        }),
      })

      if (response.ok) {
        setTradingEnabled(true)
        setTradingBalance(amount)
      } else {
        console.error('Failed to enable trading:', await response.text())
      }
    } catch (error) {
      console.error('Error enabling trading:', error)
    }
  }

  const disableTrading = async () => {
    if (!publicKey) return

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/disable-trading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: publicKey.toString() }),
      })

      if (response.ok) {
        setTradingEnabled(false)
        setTradingBalance(0)
      }
    } catch (error) {
      console.error('Error disabling trading:', error)
    }
  }

  const executeTestTrade = async () => {
    if (!publicKey || !tradingEnabled) return

    setIsTrading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/trading/test-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          tradePercentage: 10 // Trade 10% of authorized amount
        }),
      })

      if (response.ok) {
        const tradeResult = await response.json()
        setLastTrade(tradeResult)
        console.log('Test trade completed:', tradeResult)
      } else {
        console.error('Test trade failed:', await response.text())
      }
    } catch (error) {
      console.error('Error executing test trade:', error)
    } finally {
      setIsTrading(false)
    }
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
      <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
        <span className="text-3xl">💰</span> Wallet Connection
      </h2>

      <div className="space-y-4">
        {/* Wallet Connect Button */}
        <div className="flex justify-center">
          <WalletMultiButton className="!bg-gradient-to-r !from-blue-500 !to-purple-600 !rounded-lg !font-semibold !px-6 !py-3" />
        </div>

        {/* Connected Wallet Info */}
        {connected && publicKey && (
          <div className="space-y-3">
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-300">Address</span>
                <span className="text-green-400">✅ Connected</span>
              </div>
              <div className="text-sm text-gray-400 break-all">
                {publicKey.toString()}
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">Balance</span>
                <span className="text-white font-semibold">
                  {loading ? (
                    <span className="text-yellow-400">Loading...</span>
                  ) : balance !== null ? (
                    `${balance.toFixed(4)} SOL`
                  ) : (
                    <span className="text-red-400">Error</span>
                  )}
                </span>
              </div>
            </div>

            {/* Trading Authorization */}
            <div className="bg-white/5 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3">🤖 Trading Bot</h3>

              {!tradingEnabled ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-300">Enable automated trading with your wallet</p>

                  {/* Quick Amount Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => enableTrading(1.0)}
                      className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 font-semibold py-2 px-3 rounded-lg transition-all duration-300 text-sm"
                    >
                      1 SOL
                    </button>
                    <button
                      onClick={() => enableTrading(5.0)}
                      className="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 font-semibold py-2 px-3 rounded-lg transition-all duration-300 text-sm"
                    >
                      5 SOL
                    </button>
                    <button
                      onClick={() => enableTrading(10.0)}
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
                        onChange={(e) => setCustomAmount(e.target.value)}
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
                        Enable
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
                    onClick={executeTestTrade}
                    disabled={isTrading}
                    className="w-full bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-500/20 disabled:text-gray-500 text-blue-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300 mb-2"
                  >
                    {isTrading ? '⏳ Trading...' : '🔄 Test Trade (10%)'}
                  </button>

                  <button
                    onClick={disableTrading}
                    className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300"
                  >
                    Disable Trading
                  </button>
                </div>
              )}
            </div>

            {/* Last Trade Results */}
            {lastTrade && (
              <div className="bg-white/5 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">📈 Last Trade</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Trade 1:</span>
                    <span className="text-green-400">{lastTrade.trade1?.type} {lastTrade.trade1?.amount} SOL → USDT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Trade 2:</span>
                    <span className="text-blue-400">{lastTrade.trade2?.type} USDT → SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Result:</span>
                    <span className={lastTrade.profit >= 0 ? "text-green-400" : "text-red-400"}>
                      {lastTrade.profit >= 0 ? '+' : ''}{lastTrade.profit?.toFixed(6)} SOL
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Status:</span>
                    <span className="text-white">{lastTrade.status}</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleDisconnect}
              className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300"
            >
              Disconnect Wallet
            </button>
          </div>
        )}

        {/* Not Connected State */}
        {!connected && (
          <div className="text-center text-gray-400">
            <p>Connect your Solana wallet to start trading</p>
            <p className="text-sm mt-2">Supports Phantom, Solflare, and more</p>
          </div>
        )}
      </div>
    </div>
  )
}