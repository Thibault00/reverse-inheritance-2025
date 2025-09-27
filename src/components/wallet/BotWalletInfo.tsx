'use client'

import React from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js'

interface BotWalletInfoProps {
  botWallet: {
    address: string;
    balance: number;
  } | null
  fundingAmount: string
  isFunding: boolean
  onFundingAmountChange: (amount: string) => void
  onRefreshBotWallet: () => void
}

export function BotWalletInfo({
  botWallet,
  fundingAmount,
  isFunding,
  onFundingAmountChange,
  onRefreshBotWallet
}: BotWalletInfoProps) {
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()

  const handleRealFunding = async () => {
    if (!publicKey || !botWallet || !fundingAmount) return

    const amount = parseFloat(fundingAmount)
    if (amount <= 0) return

    try {
      console.log('🔄 Starting transfer...')

      // Create transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(botWallet.address),
        lamports: amount * LAMPORTS_PER_SOL,
      })

      // Create transaction
      const transaction = new Transaction().add(transferInstruction)

      // Get latest blockhash with multiple endpoint fallback
      console.log('🔄 Getting latest blockhash...')
      let blockhash
      let workingConnection = connection

      // Try multiple RPC endpoints with better free tier providers
      const fallbackEndpoints = [
        'https://api.mainnet-beta.solana.com',
        'https://rpc.ankr.com/solana',
        'https://solana.public-rpc.com',
        'https://mainnet.helius-rpc.com',
        'https://rpc.solana.com',
        'https://solana-mainnet.rpc.extrnode.com',
        'https://rpc.ankr.com/solana',
        'https://solana-api.projectserum.com'
      ]

      try {
        const result = await workingConnection.getLatestBlockhash('confirmed')
        blockhash = result.blockhash
      } catch (rpcError: unknown) {
        console.error('Primary RPC failed:', rpcError)

        if ((rpcError instanceof Error && rpcError.message?.includes('403')) || (rpcError instanceof Error && rpcError.message?.includes('API key'))) {
          console.log('🔄 Trying fallback RPC endpoints...')

          for (const endpoint of fallbackEndpoints) {
            try {
              console.log(`🔄 Trying endpoint: ${endpoint}`)
              const fallbackConnection = new Connection(endpoint, 'confirmed')
              const result = await fallbackConnection.getLatestBlockhash('confirmed')
              blockhash = result.blockhash
              workingConnection = fallbackConnection
              console.log(`✅ Found working endpoint: ${endpoint}`)
              break
            } catch (fallbackError) {
              console.log(`❌ Endpoint failed: ${endpoint}`, fallbackError)
              continue
            }
          }

          if (!blockhash) {
            throw new Error('All RPC endpoints failed. Please try again later.')
          }
        } else {
          throw rpcError
        }
      }

      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey

      console.log('🔄 Sending transaction...')
      // Send transaction
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      })

      console.log('🔄 Waiting for confirmation...', signature)
      // Wait for confirmation with timeout
      await connection.confirmTransaction(signature, 'confirmed')

      console.log('✅ Real transfer completed:', signature)
      alert(`✅ Successfully transferred ${amount} SOL to bot wallet!\n\nTransaction: ${signature}\n\nCheck on Solscan: https://solscan.io/tx/${signature}`)

      // Clear the input and refresh bot wallet
      onFundingAmountChange('')
      onRefreshBotWallet()

    } catch (error: unknown) {
      console.error('❌ Transfer failed:', error)

      let errorMessage = 'Unknown error occurred'
      if (error instanceof Error && error.message) {
        if (error.message.includes('403') || error.message.includes('Forbidden')) {
          errorMessage = 'RPC endpoint rate limited. Please try again in a moment.'
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient SOL balance for transfer + gas fees'
        } else {
          errorMessage = error.message
        }
      }

      alert(`❌ Transfer failed: ${errorMessage}`)
    }
  }

  if (!botWallet) return null

  return (
    <div className="bg-white/5 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-white mb-3">🤖 Trading Bot Wallet</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Bot Address:</span>
          <span className="text-blue-400 text-xs">
            {botWallet.address?.slice(0, 8)}...{botWallet.address?.slice(-8)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-300">Bot Balance:</span>
          <span className="text-green-400 font-semibold">
            {botWallet.balance?.toFixed(6)} SOL
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <label className="text-xs text-gray-400">Fund Bot Wallet (SOL)</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={fundingAmount}
              onChange={(e) => onFundingAmountChange(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.1"
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-400 text-sm focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleRealFunding}
              disabled={!fundingAmount || parseFloat(fundingAmount) <= 0 || isFunding}
              className="bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-500/20 disabled:text-gray-500 text-blue-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300 text-sm"
            >
              {isFunding ? 'Funding...' : '💰 REAL FUND'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}