'use client'

import React, { useEffect, useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { WalletInfo } from './WalletInfo'
import { TradingControls } from './TradingControls'
import { TradeResults } from './TradeResults'

export function WalletConnection() {
  const { connected, publicKey, disconnect, signMessage } = useWallet()
  const { connection } = useConnection()
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [tradingEnabled, setTradingEnabled] = useState(false)
  const [tradingBalance, setTradingBalance] = useState(0)
  const [customAmount, setCustomAmount] = useState('')
  const [isTrading, setIsTrading] = useState(false)
  const [lastTrade, setLastTrade] = useState<any>(null)

  // Fetch wallet balance and trading status when connected
  useEffect(() => {
    const fetchWalletData = async () => {
      if (connected && publicKey) {
        setLoading(true)
        try {
          // Get wallet info from backend (includes balance AND trading status)
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/info/${publicKey.toString()}`)

          if (response.ok) {
            const walletData = await response.json()
            setBalance(walletData.balance)
            setTradingEnabled(walletData.tradingEnabled || false)
            setTradingBalance(walletData.tradingBalance || 0)
          } else {
            // Fallback: Save wallet with 0 balance and let backend update it
            await saveWalletToBackend(publicKey.toString(), 0)
            setBalance(0)
            setTradingEnabled(false)
            setTradingBalance(0)
          }
        } catch (error) {
          console.error('Error fetching wallet data:', error)
          // Fallback: Save wallet with 0 balance
          try {
            await saveWalletToBackend(publicKey.toString(), 0)
            setBalance(0)
            setTradingEnabled(false)
            setTradingBalance(0)
          } catch (saveError) {
            console.error('Error saving wallet:', saveError)
            setBalance(null)
          }
        } finally {
          setLoading(false)
        }
      } else {
        setBalance(null)
        setTradingEnabled(false)
        setTradingBalance(0)
      }
    }

    fetchWalletData()
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


  const enableTrading = async (amount: number) => {
    if (!publicKey || !signMessage) return

    try {
      // Create authorization message for the user to sign
      const authMessage = `Authorize Solana Trading Bot to trade with ${amount} SOL on your behalf.\n\nWallet: ${publicKey.toString()}\nAmount: ${amount} SOL\nTimestamp: ${Date.now()}\n\nThis allows the bot to execute automated trades 24/7 without requiring manual signatures for each transaction.`

      console.log('🔐 Requesting wallet signature for trading authorization...')

      // Sign the authorization message
      const messageBytes = new TextEncoder().encode(authMessage)
      const signature = await signMessage(messageBytes)

      console.log('✅ Authorization signature received')

      // First, ensure wallet is saved to database
      await saveWalletToBackend(publicKey.toString(), balance || 0)

      // Send authorization to backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/authorize-trading`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: publicKey.toString(),
          tradingAmount: amount,
          authMessage: authMessage,
          signature: Array.from(signature),
          timestamp: Date.now()
        }),
      })

      if (response.ok) {
        setTradingEnabled(true)
        setTradingBalance(amount)
        alert(`✅ Trading authorized! Bot can now trade up to ${amount} SOL autonomously 24/7`)
      } else {
        const errorText = await response.text()
        console.error('Failed to authorize trading:', errorText)
        alert(`❌ Authorization failed: ${errorText}`)
      }
    } catch (error: any) {
      console.error('Error authorizing trading:', error)
      alert(`❌ Authorization failed: ${error.message || error}`)
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


  const executeAutomatedTrade = async () => {
    if (!publicKey || !tradingEnabled) return

    setIsTrading(true)
    try {
      console.log('🤖 Requesting backend to execute automated trade...')

      // Call backend to execute trade autonomously using bot wallet
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/bot-trading/auto-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWalletAddress: publicKey.toString(),
          tradePercentage: 10 // Trade 10% of authorized amount
        }),
      })

      if (response.ok) {
        const tradeResult = await response.json()
        setLastTrade(tradeResult)
        console.log('✅ Automated trade completed:', tradeResult)

        const profit = tradeResult.result?.profit || 0
        const signatures = tradeResult.result?.signatures || []

        alert(`✅ Automated trade completed autonomously!
P&L: ${profit.toFixed(6)} SOL

🔗 View on Solscan:
Trade 1: https://solscan.io/tx/${signatures[0] || 'N/A'}
Trade 2: https://solscan.io/tx/${signatures[1] || 'N/A'}

✨ No manual signing required - bot executed trades automatically!`)
      } else {
        const errorText = await response.text()
        console.error('Automated trade failed:', errorText)
        alert(`❌ Trade failed: ${errorText}`)
      }
    } catch (error: any) {
      console.error('❌ Automated trade failed:', error)
      alert(`❌ Trade failed: ${error.message || error}`)
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
            <WalletInfo
              publicKey={publicKey}
              balance={balance}
              loading={loading}
            />


            <TradingControls
              tradingEnabled={tradingEnabled}
              tradingBalance={tradingBalance}
              customAmount={customAmount}
              isTrading={isTrading}
              onCustomAmountChange={setCustomAmount}
              onEnableTradingWithAmount={enableTrading}
              onExecuteAutomatedTrade={executeAutomatedTrade}
              onDisableTrading={disableTrading}
            />

            <TradeResults lastTrade={lastTrade} />

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