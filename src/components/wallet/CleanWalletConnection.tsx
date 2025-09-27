'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useCallback, useEffect, useState } from 'react';

export function CleanWalletConnection() {
	const { connected, publicKey, sendTransaction } = useWallet();
	const { connection } = useConnection();
	const [userBalance, setUserBalance] = useState<number | null>(null);
	const [balanceLoading, setBalanceLoading] = useState(false);
	const [botWalletInfo, setBotWalletInfo] = useState<{
		address: string;
		balanceSOL: number;
		balanceUSDT: number;
		balanceUSDC: number;
		tokens: Record<string, number>;
		activeTokens: Record<string, number>;
	} | null>(null);
	const [isTrading, setIsTrading] = useState(false);
	const [customAmount, setCustomAmount] = useState('');
	const [sellToken, setSellToken] = useState('SOL');
	const [buyToken, setBuyToken] = useState('USDT');
	const [swapAmount, setSwapAmount] = useState('');
	const [recentTrades, setRecentTrades] = useState<
		Array<{
			trade_id: string;
			input_token: string;
			output_token: string;
			input_amount: number;
			output_amount: number;
			signature: string;
			fee_sol: number;
			timestamp: string;
			status: string;
		}>
	>([]);

	// Fetch user wallet balance using backend proxy to avoid CORS/rate limiting
	const fetchUserBalance = useCallback(async () => {
		if (connected && publicKey) {
			setBalanceLoading(true);
			try {
				console.log(`🔄 Fetching balance for: ${publicKey.toString()}`);

				// Method 1: Try backend proxy first (avoids CORS and rate limiting)
				try {
					console.log(`🔄 Trying backend proxy for balance...`);
					const response = await fetch(
						`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/balance/${publicKey.toString()}`
					);

					if (response.ok) {
						const data = await response.json();
						const solBalance = data.balance || 0;
						setUserBalance(solBalance);
						console.log(`✅ User balance fetched via backend: ${solBalance} SOL`);
						return;
					} else {
						console.log(`❌ Backend proxy failed: ${response.status}`);
					}
				} catch (backendError: unknown) {
					console.log(`❌ Backend proxy error: ${backendError instanceof Error ? backendError.message : 'Unknown error'}`);
				}

				// Method 2: Try wallet's built-in connection (often works better than manual RPC)
				try {
					console.log(`🔄 Trying wallet adapter connection...`);
					const balance = await connection.getBalance(publicKey, 'confirmed');
					const solBalance = balance / 1_000_000_000;
					setUserBalance(solBalance);
					console.log(`✅ User balance fetched via wallet adapter: ${solBalance} SOL`);
					return;
				} catch (walletError: unknown) {
					console.log(`❌ Wallet adapter failed: ${walletError instanceof Error ? walletError.message : 'Unknown error'}`);
				}

				// Method 3: Fallback to direct RPC calls with working mainnet endpoints
				const workingEndpoints = [
					'https://api.mainnet-beta.solana.com',
					'https://solana-api.projectserum.com',
					'https://rpc.ankr.com/solana',
				];

				for (let i = 0; i < workingEndpoints.length; i++) {
					const endpoint = workingEndpoints[i];

					try {
						console.log(`🔄 Trying endpoint ${i + 1}/${workingEndpoints.length}: ${endpoint}`);

						const { Connection } = await import('@solana/web3.js');
						const conn = new Connection(endpoint, 'confirmed');

						const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000));

						const balancePromise = conn.getBalance(publicKey, 'confirmed');
						const balance = (await Promise.race([balancePromise, timeoutPromise])) as number;

						const solBalance = balance / 1_000_000_000;
						setUserBalance(solBalance);
						console.log(`✅ User balance fetched via ${endpoint}: ${solBalance} SOL`);
						return;
					} catch (rpcError: unknown) {
						console.log(`❌ RPC ${endpoint} failed: ${rpcError instanceof Error ? rpcError.message : 'Unknown error'}`);
						continue;
					}
				}

				// If all methods fail, set to 0 and show error
				console.error('❌ All balance fetch methods failed');
				setUserBalance(0);
			} catch (error) {
				console.error('❌ Error fetching user balance:', error);
				setUserBalance(0);
			} finally {
				setBalanceLoading(false);
			}
		} else {
			setUserBalance(null);
			setBalanceLoading(false);
		}
	}, [connected, publicKey, connection]);

	// Fetch recent trades from database
	const fetchRecentTrades = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/trades?limit=5`);
			if (response.ok) {
				const data = await response.json();
				setRecentTrades(data.trades || []);
			}
		} catch (error) {
			console.error('❌ Error fetching trades:', error);
		}
	};

	// Fetch bot wallet LIVE balance from blockchain (both SOL and USDT) - DATABASE-FIRST
	const fetchBotWalletLive = async () => {
		try {
			console.log('🔄 Fetching live bot wallet balance with database-first approach...');
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/bot-wallet-live`);
			if (response.ok) {
				const data = await response.json();
				console.log('✅ Bot wallet data (database-first):', data.wallet);
				setBotWalletInfo(data.wallet);
			} else {
				console.error('❌ Failed to fetch bot wallet live data:', response.status);
			}
		} catch (error) {
			console.error('❌ Error fetching bot wallet live data:', error);
		}
	};

	// Fund bot wallet
	const fundBotWallet = async (amount: number) => {
		if (!connected || !publicKey || !botWalletInfo) return;

		try {
			console.log(`💰 Creating funding transaction: ${amount} SOL to bot wallet...`);

			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/bot-trading/fund-bot`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userWalletAddress: publicKey.toString(),
					amount: amount,
				}),
			});

			if (response.ok) {
				const fundingResult = await response.json();

				if (fundingResult.transactionData) {
					console.log('🔐 Signing funding transaction...');

					const { Transaction } = await import('@solana/web3.js');
					const transactionBytes = Uint8Array.from(atob(fundingResult.transactionData.transaction), (c) => c.charCodeAt(0));
					const transaction = Transaction.from(transactionBytes);

					console.log('📡 Sending transaction through wallet adapter...');
					const txSignature = await sendTransaction(transaction, connection, {
						skipPreflight: false,
						preflightCommitment: 'confirmed',
					});
					console.log('✅ Funding transaction sent:', txSignature);

					await connection.confirmTransaction(txSignature, 'confirmed');
					console.log('✅ Funding transaction confirmed');

					alert(`✅ Bot wallet funded successfully! \\n\\nTransaction: ${txSignature}`);

					// Refresh balances
					await fetchUserBalance();
					await fetchBotWalletLive();
				}
			}
		} catch (error: unknown) {
			console.error('Error funding bot wallet:', error);
			alert(`❌ Funding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	};

	// Fetch data when connected
	useEffect(() => {
		if (connected && publicKey) {
			fetchUserBalance();
			fetchBotWalletLive();
			fetchRecentTrades();
		}
	}, [connected, publicKey, fetchUserBalance]);

	// Auto refresh both user and bot wallet every 30 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			if (connected && publicKey) {
				fetchUserBalance(); // Also refresh user balance
				fetchBotWalletLive();
			}
		}, 30000);

		return () => clearInterval(interval);
	}, [connected, publicKey]);

	// Get available tokens for dropdown (show all tokens, including zero balance)
	const getAvailableTokens = () => {
		if (!botWalletInfo?.tokens) return ['SOL', 'USDT', 'USDC'];
		const tokens = Object.keys(botWalletInfo.tokens);
		// Always include base tokens even if not in wallet yet
		const baseTokens = ['SOL', 'USDT', 'USDC'];
		const allTokens = [...new Set([...baseTokens, ...tokens])];
		return allTokens;
	};

	// Get all possible tokens (including zero balance ones for buy side)
	const getAllTokens = () => {
		if (!botWalletInfo?.tokens) return ['SOL', 'USDT', 'USDC'];
		const tokens = Object.keys(botWalletInfo.tokens);
		// Ensure USDT is always available as an option
		const baseTokens = ['SOL', 'USDT', 'USDC'];
		const allTokens = [...new Set([...baseTokens, ...tokens])];
		return allTokens;
	};

	// Auto-switch buy token when sell token changes to avoid same-token swaps
	const handleSellTokenChange = (newSellToken: string) => {
		setSellToken(newSellToken);

		// If buy token is the same as new sell token, switch to a different one
		if (buyToken === newSellToken) {
			const availableTokens = getAllTokens().filter((token) => token !== newSellToken);
			if (availableTokens.length > 0) {
				setBuyToken(availableTokens[0]);
			}
		}
	};

	// Get token balance
	const getTokenBalance = (token: string) => {
		if (!botWalletInfo?.tokens) return 0;
		return botWalletInfo.tokens[token] || 0;
	};

	// Execute custom swap
	const executeCustomSwap = async () => {
		if (!swapAmount || parseFloat(swapAmount) <= 0) {
			alert('Please enter a valid amount');
			return;
		}

		if (sellToken === buyToken) {
			alert('Cannot swap the same token to itself');
			return;
		}

		const amount = parseFloat(swapAmount);
		const balance = getTokenBalance(sellToken);

		if (amount > balance) {
			alert(`Insufficient ${sellToken} balance. Available: ${balance}`);
			return;
		}

		setIsTrading(true);
		try {
			const requestBody = {
				fromToken: sellToken,
				toToken: buyToken,
				amount: amount,
			};

			console.log(`🔄 Executing swap: ${amount} ${sellToken} -> ${buyToken}`);
			console.log('📤 Request body:', requestBody);

			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/trade`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody),
			});

			if (response.ok) {
				const result = await response.json();
				console.log('✅ Custom swap successful:', result);
				alert(
					`✅ Swap completed! \\\\n\\\\nSwapped ${result.inputAmount} ${sellToken} for ${result.outputAmount} ${buyToken}\\\\n\\\\nSignature: ${result.signature}`
				);

				// Clear form and refresh
				setSwapAmount('');
				await fetchBotWalletLive();
				await fetchRecentTrades();
			} else {
				const errorText = await response.text();
				console.error('Custom swap failed:', errorText);
				alert(`❌ Swap failed: ${errorText}`);
			}
		} catch (error: unknown) {
			console.error('Error executing custom swap:', error);
			alert(`❌ Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setIsTrading(false);
		}
	};

	return (
		<div className="min-h-screen bg-black">
			<div className="max-w-4xl mx-auto p-8">
				{/* Header */}
				<div className="text-center mb-12">
					<h1 className="text-4xl font-bold text-white mb-2">Trading Bot</h1>
					<p className="text-gray-400">Manage your Solana wallet and execute trades</p>
				</div>

				{/* Wallet Connection */}
				<div className="flex justify-center mb-8">
					<WalletMultiButton className="!bg-white !text-black hover:!bg-gray-100 !rounded-xl !font-semibold !px-8 !py-3 !text-base !border-0 !transition-all !duration-200" />
				</div>

				{/* Connected Wallet Info */}
				{connected && publicKey && (
					<div className="space-y-6">
						{/* User Wallet Card */}
						<div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
							<div className="flex items-center justify-between mb-6">
								<h2 className="text-xl font-semibold text-white">Your Wallet</h2>
								<button onClick={fetchUserBalance} className="text-gray-400 hover:text-gray-300 text-sm transition-colors">
									Refresh
								</button>
							</div>
							<div className="space-y-4">
								<div className="flex justify-between items-center">
									<span className="text-gray-400">Address</span>
									<span className="font-mono text-sm text-gray-200">
										{publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-gray-400">Balance</span>
									<span className="font-semibold text-xl text-white">
										{balanceLoading ? (
											<span className="text-yellow-400">Loading...</span>
										) : userBalance === null ? (
											<span className="text-red-400">Failed to load</span>
										) : (
											`${userBalance.toFixed(4)} SOL`
										)}
									</span>
								</div>
							</div>
						</div>

						{/* Fund Bot Section */}
						<div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
							<h2 className="text-xl font-semibold text-white mb-6">Fund Bot</h2>
							<div className="flex gap-3 mb-4">
								<button
									onClick={() => fundBotWallet(0.01)}
									className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors"
								>
									0.01 SOL
								</button>
								<button
									onClick={() => fundBotWallet(0.1)}
									className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors"
								>
									0.1 SOL
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
									className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
									className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white disabled:text-gray-400 py-3 px-6 rounded-lg text-sm font-medium transition-colors"
								>
									Fund
								</button>
							</div>
						</div>

						{/* Trading Interface */}
						{botWalletInfo && (
							<div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
								<h2 className="text-xl font-semibold text-white mb-6">Trading</h2>

								{/* Bot Balance Summary */}
								<div className="bg-gray-800 rounded-lg p-4 mb-6">
									<div className="text-sm font-medium text-gray-300 mb-3">Bot Wallet Balances</div>
									<div className="grid grid-cols-3 gap-4">
										<div className="text-center">
											<div className="text-lg font-bold text-white">{botWalletInfo.balanceSOL?.toFixed(4) || '0.0000'}</div>
											<div className="text-xs text-gray-400">SOL</div>
										</div>
										<div className="text-center">
											<div className="text-lg font-bold text-green-400">{botWalletInfo.balanceUSDT?.toFixed(2) || '0.00'}</div>
											<div className="text-xs text-gray-400">USDT</div>
										</div>
										<div className="text-center">
											<div className="text-lg font-bold text-blue-400">{botWalletInfo.balanceUSDC?.toFixed(2) || '0.00'}</div>
											<div className="text-xs text-gray-400">USDC</div>
										</div>
									</div>
								</div>

								{/* Simple Swap Interface */}
								<div className="bg-gray-800 rounded-lg p-4">
									<div className="text-sm font-medium text-gray-300 mb-4">Token Swap</div>
									<div className="grid grid-cols-2 gap-4 mb-4">
										<div>
											<label className="block text-xs text-gray-400 mb-2">From</label>
											<select
												value={sellToken}
												onChange={(e) => handleSellTokenChange(e.target.value)}
												className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
											>
												{getAvailableTokens().map((token) => (
													<option key={token} value={token}>
														{token} ({getTokenBalance(token).toFixed(4)})
													</option>
												))}
											</select>
										</div>
										<div>
											<label className="block text-xs text-gray-400 mb-2">To</label>
											<select
												value={buyToken}
												onChange={(e) => setBuyToken(e.target.value)}
												className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
											>
												{getAllTokens()
													.filter((token) => token !== sellToken)
													.map((token) => (
														<option key={token} value={token}>
															{token}
														</option>
													))}
											</select>
										</div>
									</div>

									<div className="mb-4">
										<label className="block text-xs text-gray-400 mb-2">Amount</label>
										<div className="flex gap-2">
											<input
												type="number"
												value={swapAmount}
												onChange={(e) => setSwapAmount(e.target.value)}
												placeholder={`Enter ${sellToken} amount`}
												min="0"
												step="0.000001"
												className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
											/>
											<button
												onClick={() => setSwapAmount((getTokenBalance(sellToken) * 0.5).toString())}
												className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded-lg text-xs transition-colors"
											>
												50%
											</button>
											<button
												onClick={() => setSwapAmount((getTokenBalance(sellToken) * 0.9).toString())}
												className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded-lg text-xs transition-colors"
											>
												90%
											</button>
										</div>
									</div>

									<button
										onClick={executeCustomSwap}
										disabled={isTrading || !swapAmount || parseFloat(swapAmount) <= 0}
										className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white disabled:text-gray-400 py-3 px-4 rounded-lg font-medium transition-colors"
									>
										{isTrading ? 'Swapping...' : `Swap ${sellToken} → ${buyToken}`}
									</button>
								</div>

								{/* Low Balance Warning */}
								{(botWalletInfo.balanceSOL || 0) <= 0.005 && (
									<div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mt-4">
										<p className="text-red-300 text-sm">⚠️ Bot wallet needs more SOL for trades (minimum 0.005 SOL recommended)</p>
									</div>
								)}
							</div>
						)}

						{/* Recent Trades */}
						<div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
							<div className="flex items-center justify-between mb-6">
								<h2 className="text-xl font-semibold text-white">Recent Trades</h2>
								<button
									onClick={fetchRecentTrades}
									className="text-gray-400 hover:text-gray-300 text-sm transition-colors"
								>
									Refresh
								</button>
							</div>
							
							{recentTrades.length > 0 ? (
								<div className="space-y-3">
									{recentTrades.map((trade) => (
										<div key={trade.trade_id} className="bg-gray-800 rounded-lg p-4">
											<div className="flex justify-between items-center mb-2">
												<div className="flex items-center gap-2">
													<span className="text-sm font-medium text-white">
														{trade.input_amount.toFixed(4)} {trade.input_token} → {trade.output_amount.toFixed(4)} {trade.output_token}
													</span>
													<span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">
														{trade.status}
													</span>
												</div>
												<div className="text-xs text-gray-400">
													{new Date(trade.timestamp).toLocaleTimeString()}
												</div>
											</div>
											<div className="flex justify-between text-xs text-gray-400">
												<span>Fee: {trade.fee_sol.toFixed(6)} SOL</span>
												{trade.signature && (
													<a
														href={`https://solscan.io/tx/${trade.signature}`}
														target="_blank"
														rel="noopener noreferrer"
														className="text-blue-400 hover:text-blue-300 transition-colors"
													>
														View on Solscan ↗
													</a>
												)}
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-8">
									<p className="text-gray-400">No trades yet</p>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Not Connected State */}
				{!connected && (
					<div className="text-center py-12">
						<p className="text-gray-400 text-lg">Connect your Solana wallet to start trading</p>
					</div>
				)}
			</div>
		</div>
	);
}
