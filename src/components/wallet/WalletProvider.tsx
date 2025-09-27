'use client'

import React, { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { clusterApiUrl } from '@solana/web3.js'

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css'

interface Props {
  children: React.ReactNode
}

export function SolanaWalletProvider({ children }: Props) {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Mainnet

  // Use multiple reliable RPC endpoints with generous free tiers
  const endpoint = useMemo(() => {
    // Primary endpoint that typically has better reliability
    const primaryEndpoints = [
      'https://api.mainnet-beta.solana.com',
      'https://solana.public-rpc.com',
      'https://rpc.ankr.com/solana',
      'https://mainnet.helius-rpc.com'
    ]

    // Use the first endpoint for primary connection
    return primaryEndpoints[0]
  }, [network])

  // Configure supported wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [network]
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}