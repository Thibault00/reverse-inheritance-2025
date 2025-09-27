'use client';

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import React, { useMemo } from 'react';
// import { clusterApiUrl } from '@solana/web3.js' // Removed unused import

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface Props {
	children: React.ReactNode;
}

export function SolanaWalletProvider({ children }: Props) {
	// The network can be set to 'devnet', 'testnet', or 'mainnet-beta'
	const network = WalletAdapterNetwork.Mainnet;

	// Use a reliable free public RPC endpoint
	const endpoint = useMemo(() => {
		// Use the official Solana mainnet RPC endpoint
		return 'https://api.mainnet-beta.solana.com';
	}, []);

	// Configure supported wallets
	const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

	return (
		<ConnectionProvider endpoint={endpoint}>
			<WalletProvider wallets={wallets} autoConnect>
				<WalletModalProvider>{children}</WalletModalProvider>
			</WalletProvider>
		</ConnectionProvider>
	);
}
