'use client';

import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState } from 'react';

export function CleanWalletConnection() {
	const { connected, publicKey, sendTransaction } = useWallet();
	const { connection } = useConnection();
	const [userBalance, setUserBalance] = useState<number | null>(null);
	const [balanceLoading, setBalanceLoading] = useState(false);
	const [botWalletInfo, setBotWalletInfo] = useState<any>(null);
	const [isTrading, setIsTrading] = useState(false);
	const [customAmount, setCustomAmount] = useState('');
	const [sellToken, setSellToken] = useState('SOL');
	const [buyToken, setBuyToken] = useState('USDT');
	const [swapAmount, setSwapAmount] = useState('');

	// Fetch user wallet balance using wallet adapter connection
	const fetchUserBalance = async () => {
		if (connected && publicKey) {
			setBalanceLoading(true);
			try {
				console.log(`🔄 Fetching balance for: ${publicKey.toString()}`);

				// Try multiple RPC endpoints for better reliability (skip wallet adapter first)
				const rpcEndpoints = [
					'https://solana-api.projectserum.com',
					'https://rpc.ankr.com/solana',
					'https://mainnet.helius-rpc.com/?api-key=demo',
					'https://solana-mainnet.g.alchemy.com/v2/demo',
					connection, // Use the wallet adapter's connection as last resort
					'https://api.mainnet-beta.solana.com',
				];

				for (let i = 0; i < rpcEndpoints.length; i++) {
					const endpoint = rpcEndpoints[i];
					const endpointName = typeof endpoint === 'string' ? endpoint : 'wallet adapter';

					try {
						console.log(`🔄 Trying RPC endpoint ${i + 1}/${rpcEndpoints.length}: ${endpointName}`);

						let conn = endpoint;
						if (typeof endpoint === 'string') {
							const { Connection } = await import('@solana/web3.js');
							conn = new Connection(endpoint, {
								commitment: 'confirmed',
								confirmTransactionInitialTimeout: 10000, // 10 second timeout
								httpHeaders: {
									'User-Agent': 'SolanaWallet/1.0',
								},
							});
						}

						// Add timeout to balance fetch
						const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 8000));

						const balancePromise = conn.getBalance(publicKey, 'confirmed');
						const balance = await Promise.race([balancePromise, timeoutPromise]);

						const solBalance = balance / 1_000_000_000; // Convert lamports to SOL
						setUserBalance(solBalance);
						console.log(`✅ User balance fetched: ${solBalance} SOL (via ${endpointName})`);
						return; // Success, exit the loop
					} catch (rpcError) {
						console.log(`❌ RPC failed (${i + 1}/${rpcEndpoints.length}): ${endpointName} - ${rpcError.message || rpcError}`);

						// If this is not the last endpoint, continue to next one
						if (i < rpcEndpoints.length - 1) {
							console.log(`🔄 Trying next RPC endpoint...`);
							continue;
						}
					}
				}

				// If all endpoints fail
				console.error('❌ All RPC endpoints failed to fetch balance');
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
		} catch (error: any) {
			console.error('Error funding bot wallet:', error);
			alert(`❌ Funding failed: ${error.message || error}`);
		}
	};

	// Execute test trade
	const executeTestTrade = async () => {
		setIsTrading(true);
		try {
			console.log('🧪 Executing test trade (10% of bot wallet balance)...');

			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/test-trade`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});

			if (response.ok) {
				const result = await response.json();
				console.log('✅ Test trade successful:', result);
				alert(
					`✅ Test trade completed! \\n\\nSwapped ${result.inputAmount} SOL for ${result.outputAmount} USDT\\n\\nSignature: ${result.signature}`
				);

				// Refresh bot wallet balance
				await fetchBotWalletLive();
			} else {
				const errorText = await response.text();
				console.error('Test trade failed:', errorText);
				alert(`❌ Test trade failed: ${errorText}`);
			}
		} catch (error: any) {
			console.error('Error executing test trade:', error);
			alert(`❌ Test trade failed: ${error.message || error}`);
		} finally {
			setIsTrading(false);
		}
	};

	// Execute manual trade
	const executeManualTrade = async () => {
		setIsTrading(true);
		try {
			console.log('👤 Executing manual trade (5% of bot wallet balance)...');

			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/manual-trade`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});

			if (response.ok) {
				const result = await response.json();
				console.log('✅ Manual trade successful:', result);
				alert(
					`✅ Manual trade completed! \\n\\nSwapped ${result.inputAmount} SOL for ${result.outputAmount} USDT\\n\\nSignature: ${result.signature}`
				);

				// Refresh bot wallet balance
				await fetchBotWalletLive();
			} else {
				const errorText = await response.text();
				console.error('Manual trade failed:', errorText);
				alert(`❌ Manual trade failed: ${errorText}`);
			}
		} catch (error: any) {
			console.error('Error executing manual trade:', error);
			alert(`❌ Manual trade failed: ${error.message || error}`);
		} finally {
			setIsTrading(false);
		}
	};

	// Execute reverse swap (USDT -> SOL)
	const executeReverseSwap = async () => {
		setIsTrading(true);
		try {
			console.log('🔄 Executing reverse swap (USDT -> SOL)...');

			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/reverse-swap`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});

			if (response.ok) {
				const result = await response.json();
				console.log('✅ Reverse swap successful:', result);
				alert(
					`✅ Reverse swap completed! \\n\\nSwapped ${result.inputAmount} USDT for ${result.outputAmount} SOL\\n\\nSignature: ${result.signature}`
				);

				// Refresh bot wallet balance
				await fetchBotWalletLive();
			} else {
				const errorText = await response.text();
				console.error('Reverse swap failed:', errorText);
				alert(`❌ Reverse swap failed: ${errorText}`);
			}
		} catch (error: any) {
			console.error('Error executing reverse swap:', error);
			alert(`❌ Reverse swap failed: ${error.message || error}`);
		} finally {
			setIsTrading(false);
		}
	};

	// Fetch data when connected
	useEffect(() => {
		if (connected && publicKey) {
			fetchUserBalance();
			fetchBotWalletLive();
		}
	}, [connected, publicKey]);

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

	// Get available tokens for dropdown (only tokens with balance > 0)
	const getAvailableTokens = () => {
		if (!botWalletInfo?.activeTokens) return ['SOL', 'USDT'];
		return Object.keys(botWalletInfo.activeTokens).filter((token) => botWalletInfo.activeTokens[token] > 0);
	};

	// Get all possible tokens (including zero balance ones for buy side)
	const getAllTokens = () => {
		if (!botWalletInfo?.tokens) return ['SOL', 'USDT', 'USDC'];
		return Object.keys(botWalletInfo.tokens);
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
			} else {
				const errorText = await response.text();
				console.error('Custom swap failed:', errorText);
				alert(`❌ Swap failed: ${errorText}`);
			}
		} catch (error: any) {
			console.error('Error executing custom swap:', error);
			alert(`❌ Swap failed: ${error.message || error}`);
		} finally {
			setIsTrading(false);
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 text-white p-6">
			<div className="max-w-4xl mx-auto">
				<div className="text-center mb-8">
					<h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
						🤖 Solana Trading Bot
					</h1>
					<p className="text-gray-300">Autonomous trading on Jupiter DEX</p>
				</div>

				{/* Wallet Connection */}
				<div className="bg-white/5 rounded-lg p-6 mb-6 text-center">
					<WalletMultiButton className="!bg-gradient-to-r !from-blue-500 !to-purple-600 !rounded-lg !font-semibold !px-6 !py-3" />
				</div>

				{/* Connected Wallet Info */}
				{connected && publicKey && (
					<div className="space-y-6">
						{/* User Wallet */}
						<div className="bg-green-500/10 rounded-lg p-6 border border-green-500/30">
							<div className="flex justify-between items-center mb-4">
								<h3 className="text-xl font-semibold text-green-400">👤 Your Wallet</h3>
								<button
									onClick={fetchUserBalance}
									className="bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1 rounded-lg text-sm transition-all duration-300"
								>
									🔄 Refresh
								</button>
							</div>
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-gray-300">Address</span>
									<span className="text-white font-mono text-sm">
										{publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-gray-300">Balance</span>
									<span className="text-white font-semibold text-lg">
										{balanceLoading ? (
											<span className="text-yellow-400">🔄 Loading...</span>
										) : userBalance === null ? (
											<span className="text-red-400">Failed to load</span>
										) : (
											`${userBalance.toFixed(6)} SOL`
										)}
									</span>
								</div>
							</div>
						</div>

						{/* Bot Wallet */}
						<div className="bg-purple-500/10 rounded-lg p-6 border border-purple-500/30">
							<h3 className="text-xl font-semibold text-purple-400 mb-4">🤖 Bot Wallet</h3>
							{botWalletInfo ? (
								<div className="space-y-4">
									<div className="flex justify-between items-center">
										<span className="text-gray-300">Address</span>
										<span className="text-white font-mono text-sm">
											{botWalletInfo.address.slice(0, 8)}...{botWalletInfo.address.slice(-8)}
										</span>
									</div>
									<div className="space-y-2">
										<div className="flex justify-between items-center">
											<span className="text-gray-300">SOL Balance</span>
											<span className="text-white font-semibold text-lg">{botWalletInfo.balanceSOL?.toFixed(6) || '0.000000'} SOL</span>
										</div>
										<div className="flex justify-between items-center">
											<span className="text-gray-300">USDT Balance</span>
											<span className="text-green-400 font-semibold text-lg">{botWalletInfo.balanceUSDT?.toFixed(2) || '0.00'} USDT</span>
										</div>
									</div>

									{/* Fund Bot Wallet */}
									<div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mt-4">
										<h4 className="text-blue-400 font-semibold mb-3">💰 Fund Bot Wallet</h4>
										<div className="flex gap-2 mb-3">
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

										<div className="flex gap-2">
											<input
												type="number"
												value={customAmount}
												onChange={(e) => setCustomAmount(e.target.value)}
												placeholder="Custom amount"
												min="0"
												step="0.001"
												className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-400 text-sm focus:outline-none focus:border-blue-400"
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
												className="bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-500/20 disabled:text-gray-500 text-blue-400 font-semibold py-2 px-4 rounded-lg transition-all duration-300 text-sm"
											>
												Fund
											</button>
										</div>
									</div>

									{/* Clean Token Swap Interface */}
									{getAvailableTokens().length > 0 && (
										<div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/30 rounded-lg p-6 mt-6">
											<h4 className="text-lg font-semibold text-purple-400 mb-4 text-center">💱 Token Swap</h4>

											<div className="space-y-4">
												{/* Sell Token (From) */}
												<div className="bg-white/5 rounded-lg p-4">
													<label className="block text-sm text-gray-300 mb-2">Sell</label>
													<div className="flex gap-2">
														<select
															value={sellToken}
															onChange={(e) => handleSellTokenChange(e.target.value)}
															className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-400"
														>
															{getAvailableTokens().map((token) => (
																<option key={token} value={token} className="bg-gray-800">
																	{token} (Balance: {getTokenBalance(token).toFixed(6)})
																</option>
															))}
														</select>
													</div>
													<p className="text-xs text-gray-400 mt-1">
														Available: {getTokenBalance(sellToken).toFixed(6)} {sellToken}
													</p>
												</div>

												{/* Swap Direction Indicator */}
												<div className="flex justify-center">
													<div className="bg-purple-500/20 rounded-full p-2">
														<svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
															<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
														</svg>
													</div>
												</div>

												{/* Buy Token (To) */}
												<div className="bg-white/5 rounded-lg p-4">
													<label className="block text-sm text-gray-300 mb-2">Buy</label>
													<div className="flex gap-2">
														<select
															value={buyToken}
															onChange={(e) => setBuyToken(e.target.value)}
															className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-400"
														>
															{getAllTokens()
																.filter((token) => token !== sellToken)
																.map((token) => (
																	<option key={token} value={token} className="bg-gray-800">
																		{token}
																	</option>
																))}
														</select>
													</div>
												</div>

												{/* Amount Input */}
												<div className="bg-white/5 rounded-lg p-4">
													<label className="block text-sm text-gray-300 mb-2">Amount to Sell</label>
													<div className="flex gap-2">
														<input
															type="number"
															value={swapAmount}
															onChange={(e) => setSwapAmount(e.target.value)}
															placeholder={`Enter ${sellToken} amount`}
															min="0"
															step="0.000001"
															className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-400"
														/>
														<button
															onClick={() => setSwapAmount((getTokenBalance(sellToken) * 0.5).toString())}
															className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-3 py-2 rounded-lg text-sm transition-all"
														>
															50%
														</button>
														<button
															onClick={() => setSwapAmount((getTokenBalance(sellToken) * 0.9).toString())}
															className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-3 py-2 rounded-lg text-sm transition-all"
														>
															90%
														</button>
													</div>
												</div>

												{/* Swap Button */}
												<button
													onClick={executeCustomSwap}
													disabled={isTrading || !swapAmount || parseFloat(swapAmount) <= 0}
													className="w-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 disabled:bg-gray-500/20 disabled:text-gray-500 text-white font-semibold py-4 px-4 rounded-lg transition-all duration-300 border border-purple-500/30"
												>
													{isTrading ? '🔄 Swapping...' : `💱 Swap ${sellToken} → ${buyToken}`}
												</button>

												<p className="text-xs text-gray-400 text-center">Real trades on Solana mainnet via Jupiter DEX</p>
											</div>
										</div>
									)}

									{(botWalletInfo.balanceSOL || 0) <= 0.005 && (
										<div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mt-4">
											<p className="text-red-400 text-sm">
												⚠️ Bot wallet needs more SOL for trades and token account creation (minimum 0.005 SOL recommended)
											</p>
										</div>
									)}
								</div>
							) : (
								<p className="text-gray-400">Loading bot wallet...</p>
							)}
						</div>
					</div>
				)}

				{/* Not Connected */}
				{!connected && (
					<div className="text-center text-gray-400 mt-8">
						<p>Connect your Solana wallet to start trading</p>
					</div>
				)}
			</div>
		</div>
	);
}
