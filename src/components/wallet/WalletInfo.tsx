'use client'

import React from 'react'
import { PublicKey } from '@solana/web3.js'

interface WalletInfoProps {
  publicKey: PublicKey
  balance: number | null
  loading: boolean
}

export function WalletInfo({ publicKey, balance, loading }: WalletInfoProps) {
  return (
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
    </div>
  )
}