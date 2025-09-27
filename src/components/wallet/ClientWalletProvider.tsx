'use client'

import dynamic from 'next/dynamic'

interface Props {
  children: React.ReactNode
}

// Dynamically import the wallet provider to avoid SSR issues
const SolanaWalletProvider = dynamic(
  () => import('./WalletProvider').then(mod => ({ default: mod.SolanaWalletProvider })),
  { ssr: false }
)

export function ClientWalletProvider({ children }: Props) {
  return <SolanaWalletProvider>{children}</SolanaWalletProvider>
}