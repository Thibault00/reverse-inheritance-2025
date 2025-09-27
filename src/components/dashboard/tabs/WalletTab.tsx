'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';

interface BotWalletInfo {
	address: string;
	balanceSOL: number;
	balanceUSDT: number;
	balanceUSDC: number;
	tokens: Record<string, number>;
	activeTokens: Record<string, number>;
}

interface WalletTabProps {
	userBalance: number | null;
	botWalletInfo: BotWalletInfo | null;
	onRefresh: () => void;
}

export function WalletTab({ userBalance, botWalletInfo, onRefresh }: WalletTabProps) {
	const { connected, publicKey, sendTransaction } = useWallet();
	const { connection } = useConnection();
	const [customAmount, setCustomAmount] = useState('');

	// Fund bot wallet
	const fundBotWallet = async (amount: number) => {
		if (!connected || !publicKey || !sendTransaction) return;

		try {
			console.log(`💰 Requesting funding transaction from backend: ${amount} SOL`);

			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/create-funding-transaction`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userWalletAddress: publicKey.toString(),
					amount: amount,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Backend failed: ${errorText}`);
			}

			const result = await response.json();
			console.log('✅ Got funding transaction from backend');

			const { Transaction } = await import('@solana/web3.js');
			const transactionBytes = Uint8Array.from(atob(result.transaction), (c) => c.charCodeAt(0));
			const transaction = Transaction.from(transactionBytes);

			console.log('🔐 Signing and sending transaction with Phantom...');

			// Use sendTransaction (handles both signing and sending)
			const txSignature = await sendTransaction(transaction, connection, {
				skipPreflight: false,
				preflightCommitment: 'confirmed',
			});

			console.log('✅ Transaction sent:', txSignature);

			alert(`✅ Bot wallet funded successfully! \\n\\nTransaction: ${txSignature}`);
			onRefresh();
		} catch (error: unknown) {
			console.error('Error funding bot wallet:', error);
			alert(`❌ Funding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	};

	// Withdraw from bot wallet
	const withdrawFromBot = async (amount: number) => {
		if (!connected || !publicKey) return;

		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/withdraw-from-bot`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userWalletAddress: publicKey.toString(),
					amount: amount,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Withdrawal failed: ${errorText}`);
			}

			const result = await response.json();
			alert(`✅ Withdrawal completed! \\n\\n${amount} SOL transferred from bot to your wallet\\n\\nSignature: ${result.signature}`);
			onRefresh();
		} catch (error: unknown) {
			console.error('Error withdrawing from bot:', error);
			alert(`❌ Withdrawal failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	};

	return (
		<div className="space-y-6">
			<h2 className="text-xl font-semibold text-white">Wallet Management</h2>

			{/* Your Wallet */}
			<div className="bg-gray-800 rounded-lg p-6">
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-lg font-medium text-white">Your Wallet</h3>
					<button onClick={onRefresh} className="text-gray-400 hover:text-gray-300 text-sm transition-colors">
						Refresh
					</button>
				</div>
				<div className="space-y-3">
					<div className="flex justify-between">
						<span className="text-gray-400">Address</span>
						<span className="font-mono text-sm text-gray-200">
							{publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-gray-400">Balance</span>
						<span className="font-semibold text-xl text-white">{userBalance?.toFixed(4) || '0.0000'} SOL</span>
					</div>
				</div>
			</div>

			{/* Bot Wallet */}
			{botWalletInfo && (
				<div className="bg-gray-800 rounded-lg p-6">
					<h3 className="text-lg font-medium text-white mb-4">Bot Wallet</h3>
					<div className="grid grid-cols-3 gap-4 mb-6">
						<div className="text-center">
							<div className="text-2xl font-bold text-white">{botWalletInfo.balanceSOL?.toFixed(4) || '0.0000'}</div>
							<div className="text-sm text-gray-400">SOL</div>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold text-green-400">{botWalletInfo.balanceUSDT?.toFixed(2) || '0.00'}</div>
							<div className="text-sm text-gray-400">USDT</div>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold text-blue-400">{botWalletInfo.balanceUSDC?.toFixed(2) || '0.00'}</div>
							<div className="text-sm text-gray-400">USDC</div>
						</div>
					</div>

					{/* Fund/Withdraw Controls */}
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-3">
							<button
								onClick={() => fundBotWallet(0.01)}
								className="bg-blue-700 hover:bg-blue-600 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors"
							>
								↗ Fund 0.01 SOL
							</button>
							<button
								onClick={() => withdrawFromBot(0.01)}
								className="bg-red-700 hover:bg-red-600 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors"
							>
								↙ Withdraw 0.01 SOL
							</button>
						</div>

						<div className="flex gap-3">
							<input
								type="number"
								value={customAmount}
								onChange={(e) => setCustomAmount(e.target.value)}
								placeholder="Custom amount"
								min="0"
								step="0.001"
								className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							<button
								onClick={() => {
									const amount = parseFloat(customAmount);
									if (amount > 0) {
										fundBotWallet(amount);
										setCustomAmount('');
									}
								}}
								disabled={!customAmount || parseFloat(customAmount) <= 0}
								className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors"
							>
								↗ Fund
							</button>
							<button
								onClick={() => {
									const amount = parseFloat(customAmount);
									if (amount > 0) {
										withdrawFromBot(amount);
										setCustomAmount('');
									}
								}}
								disabled={!customAmount || parseFloat(customAmount) <= 0}
								className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors"
							>
								↙ Withdraw
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
