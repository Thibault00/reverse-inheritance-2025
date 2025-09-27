'use client'

import React, { useEffect, useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { WalletInfo } from './WalletInfo'

export function WalletConnection() {
  const { connected, publicKey, disconnect, signMessage, signTransaction, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [tradingEnabled, setTradingEnabled] = useState(false)
  const [, setTradingBalance] = useState(0)
  const [customAmount, setCustomAmount] = useState('')
  const [isTrading, setIsTrading] = useState(false)
  const [, setLastTrade] = useState<{result: Record<string, unknown>} | null>(null)
  const [botWalletInfo, setBotWalletInfo] = useState<{address: string; balance: number} | null>(null)
  const [botWalletLoading, setBotWalletLoading] = useState(false)

  // Fetch bot wallet info
  const fetchBotWalletInfo = async () => {
    setBotWalletLoading(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/bot-trading/bot-wallet`)
      if (response.ok) {
        const data = await response.json()
        setBotWalletInfo(data)
      } else {
        console.error('Failed to fetch bot wallet info')
      }
    } catch (error) {
      console.error('Error fetching bot wallet info:', error)
    } finally {
      setBotWalletLoading(false)
    }
  }

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
        setBotWalletInfo(null)
      }
    }

    fetchWalletData()

    // Also fetch bot wallet info when wallet connects
    if (connected) {
      fetchBotWalletInfo()
    }
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


  const enableTrading = async (_amount: number) => {
    if (!publicKey || !signMessage || !signTransaction) return

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
        const authResult = await response.json()

        // Check if we need to sign a funding transaction
        if (authResult.requiresTransactionSigning && authResult.transactionData) {
          console.log('🔐 Signing funding transaction to transfer SOL to bot wallet...')

          try {
            // Import required Solana libraries
            const { Transaction } = await import('@solana/web3.js')

            // Decode and sign the funding transaction
            const transactionBytes = Uint8Array.from(atob(authResult.transactionData.transaction), c => c.charCodeAt(0))
            const transaction = Transaction.from(transactionBytes)

            // Sign the funding transaction
            const signedTransaction = await signTransaction(transaction)

            // Send the signed transaction using the wallet adapter's connection
            console.log('📡 Broadcasting authorization transaction using wallet adapter connection...')
            const txSignature = await connection.sendRawTransaction(signedTransaction.serialize(), {
              skipPreflight: false,
              preflightCommitment: 'confirmed'
            })
            console.log('✅ Authorization transaction sent:', txSignature)

            // Wait for confirmation
            await connection.confirmTransaction(txSignature, 'confirmed')
            console.log('✅ Authorization transaction confirmed')

            setTradingEnabled(true)
            setTradingBalance(amount)
            alert(`✅ Trading authorized & funded! Bot wallet now has ${amount} SOL for autonomous trading 24/7\n\nFunding transaction: ${txSignature}`)

          } catch (fundingError: unknown) {
            console.error('Funding transaction failed:', fundingError)
            alert(`❌ Funding failed: ${fundingError instanceof Error ? fundingError.message : 'Unknown error'}`)
          }
        } else {
          setTradingEnabled(true)
          setTradingBalance(amount)
          alert(`✅ Trading authorized! Bot can now trade up to ${amount} SOL autonomously 24/7`)
        }
      } else {
        const errorText = await response.text()
        console.error('Failed to authorize trading:', errorText)
        alert(`❌ Authorization failed: ${errorText}`)
      }
    } catch (error: unknown) {
      console.error('Error authorizing trading:', error)
      alert(`❌ Authorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const _disableTrading = async () => {
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

  const fundBotWallet = async (amount: number) => {
    if (!publicKey || !signTransaction) return

    try {
      console.log(`💰 Creating funding transaction: ${amount} SOL to bot wallet...`)

      // Get funding transaction from backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/bot-trading/fund-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWalletAddress: publicKey.toString(),
          amount: amount
        }),
      })

      if (response.ok) {
        const fundingResult = await response.json()

        if (fundingResult.transactionData) {
          console.log('🔐 Signing funding transaction...')

          // Import required Solana libraries
          const { Transaction } = await import('@solana/web3.js')

          // Decode and sign the funding transaction
          const transactionBytes = Uint8Array.from(atob(fundingResult.transactionData.transaction), c => c.charCodeAt(0))
          const transaction = Transaction.from(transactionBytes)

          // Send transaction through wallet adapter (wallet will handle signing)
          console.log('📡 Sending transaction through wallet adapter...')
          const txSignature = await sendTransaction(transaction, connection, {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
          })
          console.log('✅ Funding transaction sent:', txSignature)

          // Wait for confirmation
          await connection.confirmTransaction(txSignature, 'confirmed')
          console.log('✅ Funding transaction confirmed')

          alert(`✅ Bot wallet funded successfully! \\n\\nTransaction: ${txSignature}\\n\\nAutomated trading is now available!`)

          // Refresh wallet data to show updated state
          setTimeout(() => window.location.reload(), 2000)

        } else {
          alert('❌ Failed to create funding transaction')
        }
      } else {
        const errorText = await response.text()
        console.error('Funding failed:', errorText)
        alert(`❌ Funding failed: ${errorText}`)
      }
    } catch (error: unknown) {
      console.error('Error funding bot wallet:', error)
      alert(`❌ Funding failed: ${error.message || error}`)
    }
  }

  const executeTestTrade = async () => {
    setIsTrading(true)
    try {
      console.log('🧪 Executing test trade (10% of bot wallet balance)...')

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/test-trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Test trade successful:', result)
        alert(`✅ Test trade completed! \n\nSwapped ${result.inputAmount} SOL for ${result.outputAmount} USDT\n\nSignature: ${result.signature}`)

        // Refresh bot wallet info
        await fetchBotWalletInfo()
      } else {
        const errorText = await response.text()
        console.error('Test trade failed:', errorText)
        alert(`❌ Test trade failed: ${errorText}`)
      }
    } catch (error: unknown) {
      console.error('Error executing test trade:', error)
      alert(`❌ Test trade failed: ${error.message || error}`)
    } finally {
      setIsTrading(false)
    }
  }

  const _executeAutomatedTrade = async () => {
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
    } catch (error: unknown) {
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

            {/* Bot Wallet Status - Show FIRST */}
            <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/30">
              <h3 className="text-lg font-semibold text-purple-400 mb-3">🤖 Trading Bot Wallet</h3>

              {botWalletLoading ? (
                <p className="text-gray-400">Loading bot wallet info...</p>
              ) : botWalletInfo ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Bot Address</span>
                    <span className="text-white font-mono text-xs">{botWalletInfo.address.slice(0, 8)}...{botWalletInfo.address.slice(-8)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">Bot Balance</span>
                    <span className="text-white font-semibold">{botWalletInfo.balance} SOL</span>
                  </div>

                  {botWalletInfo.balance > 0 ? (
                    <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 mt-3 space-y-3">
                      <p className="text-green-400 text-sm font-semibold">✅ Bot wallet is funded and ready for trading!</p>

                      <button
                        onClick={executeTestTrade}
                        disabled={isTrading}
                        className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 disabled:bg-gray-500/20 disabled:text-gray-500 text-yellow-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300 text-sm"
                      >
                        {isTrading ? '🔄 Trading...' : '🧪 TEST TRADE (10% of funds)'}
                      </button>

                      <p className="text-xs text-gray-400">This will swap 10% of bot balance (SOL → USDT) autonomously</p>
                    </div>
                  ) : (
                    <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-2 mt-3 space-y-3">
                      <p className="text-red-400 text-sm">❌ Bot wallet needs funding before trading can begin</p>

                      <div className="space-y-2">
                        <p className="text-white text-sm font-semibold">Fund Bot Wallet:</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => fundBotWallet(0.001)}
                            className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-semibold py-2 px-3 rounded-lg transition-all duration-300 text-sm"
                          >
                            0.001 SOL
                          </button>
                          <button
                            onClick={() => fundBotWallet(0.01)}
                            className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-semibold py-2 px-3 rounded-lg transition-all duration-300 text-sm"
                          >
                            0.01 SOL
                          </button>
                          <button
                            onClick={() => fundBotWallet(0.1)}
                            className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-semibold py-2 px-3 rounded-lg transition-all duration-300 text-sm"
                          >
                            0.1 SOL
                          </button>
                        </div>
                        <p className="text-xs text-gray-400">Transfer SOL directly to bot wallet for trading</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-400">Failed to load bot wallet info</p>
              )}
            </div>

            {/* Simple Fund Bot Section */}
            <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
              <h3 className="text-lg font-semibold text-blue-400 mb-3">💰 Fund Trading Bot</h3>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="Amount (SOL)"
                    min="0"
                    step="0.001"
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-400 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <button
                    onClick={() => fundBotWallet(parseFloat(customAmount) || 0)}
                    disabled={!customAmount || parseFloat(customAmount) <= 0}
                    className="bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-500/20 disabled:text-gray-500 text-blue-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300"
                  >
                    🔐 Send SOL
                  </button>
                </div>
                <p className="text-xs text-gray-400">Transfer SOL from your wallet to the bot for trading</p>
              </div>
            </div>

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