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

	// Fetch user wallet balance using backend proxy to avoid CORS/rate limiting
	const fetchUserBalance = async () => {
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
				} catch (backendError) {
					console.log(`❌ Backend proxy error: ${backendError.message}`);
				}

				// Method 2: Try wallet's built-in connection (often works better than manual RPC)
				try {
					console.log(`🔄 Trying wallet adapter connection...`);
					const balance = await connection.getBalance(publicKey, 'confirmed');
					const solBalance = balance / 1_000_000_000;
					setUserBalance(solBalance);
					console.log(`✅ User balance fetched via wallet adapter: ${solBalance} SOL`);
					return;
				} catch (walletError) {
					console.log(`❌ Wallet adapter failed: ${walletError.message}`);
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
						const balance = await Promise.race([balancePromise, timeoutPromise]);

						const solBalance = balance / 1_000_000_000;
						setUserBalance(solBalance);
						console.log(`✅ User balance fetched via ${endpoint}: ${solBalance} SOL`);
						return;
					} catch (rpcError) {
						console.log(`❌ RPC ${endpoint} failed: ${rpcError.message}`);
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
								<button
									onClick={fetchUserBalance}
									className="text-gray-400 hover:text-gray-300 text-sm transition-colors"
								>
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

						{/* Trading Interface */}
						<div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
							<h2 className="text-xl font-semibold text-white mb-6">Trading</h2>
							{botWalletInfo ? (
								<div className="space-y-6">
									{/* Bot Balance Summary */}
									<div className="bg-gray-800 rounded-lg p-4">
										<div className="text-sm font-medium text-gray-300 mb-3">Bot Wallet</div>
										<div className="grid grid-cols-2 gap-4">
											<div className="text-center">
												<div className="text-2xl font-bold text-white">{botWalletInfo.balanceSOL?.toFixed(4) || '0.0000'}</div>
												<div className="text-sm text-gray-400">SOL</div>
											</div>
											<div className="text-center">
												<div className="text-2xl font-bold text-green-400">{botWalletInfo.balanceUSDT?.toFixed(2) || '0.00'}</div>
												<div className="text-sm text-gray-400">USDT</div>
											</div>
										</div>
									</div>

									{/* Fund Bot Section */}
									<div className="bg-gray-800 rounded-lg p-4">
										<div className="text-sm font-medium text-gray-300 mb-4">Fund Bot</div>
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

									{/* Simple Trading Actions */}
									<div className="bg-gray-800 rounded-lg p-4">
										<div className="text-sm font-medium text-gray-300 mb-4">Quick Actions</div>
										<div className="grid grid-cols-2 gap-3">
											<button
												onClick={executeTestTrade}
												disabled={isTrading}
												className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors"
											>
												{isTrading ? 'Trading...' : 'Test Trade'}
											</button>
											<button
												onClick={executeReverseSwap}
												disabled={isTrading}
												className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white py-3 px-4 rounded-lg text-sm font-medium transition-colors"
											>
												{isTrading ? 'Swapping...' : 'Reverse Swap'}
											</button>
										</div>
									</div>

									{/* Low Balance Warning */}
									{(botWalletInfo.balanceSOL || 0) <= 0.005 && (
										<div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
											<p className="text-red-300 text-sm">
												⚠️ Bot wallet needs more SOL for trades (minimum 0.005 SOL recommended)
											</p>
										</div>
									)}
								</div>
							) : (
								<div className="text-center py-8">
									<p className="text-gray-400">Loading bot wallet...</p>
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
