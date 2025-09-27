'use client';

import { useEffect, useState } from 'react';

interface Trade {
	trade_id: string;
	input_token: string;
	output_token: string;
	input_amount: number;
	output_amount: number;
	price: number;
	signature: string;
	fee_sol: number;
	timestamp: string;
	status: string;
	trade_action: string;
}

export function TradesTab() {
	const [trades, setTrades] = useState<Trade[]>([]);
	const [swapAmount, setSwapAmount] = useState('');
	const [sellToken, setSellToken] = useState('SOL');
	const [buyToken, setBuyToken] = useState('USDT');
	const [isTrading, setIsTrading] = useState(false);

	// Fetch recent trades
	const fetchTrades = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/trades?limit=10`);
			if (response.ok) {
				const data = await response.json();
				setTrades(data.trades || []);
			}
		} catch (error) {
			console.error('Error fetching trades:', error);
		}
	};

	// Execute manual trade
	const executeManualTrade = async () => {
		if (!swapAmount || parseFloat(swapAmount) <= 0) {
			alert('Please enter a valid amount');
			return;
		}

		setIsTrading(true);
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/trade`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					fromToken: sellToken,
					toToken: buyToken,
					amount: parseFloat(swapAmount),
				}),
			});

			if (response.ok) {
				const result = await response.json();
				alert(
					`✅ Trade completed! \\n\\n${result.inputAmount} ${sellToken} → ${result.outputAmount} ${buyToken}\\n\\nSignature: ${result.signature}`
				);
				setSwapAmount('');
				fetchTrades();
			} else {
				const errorText = await response.text();
				alert(`❌ Trade failed: ${errorText}`);
			}
		} catch (error: unknown) {
			console.error('Error executing trade:', error);
			alert(`❌ Trade failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			setIsTrading(false);
		}
	};

	useEffect(() => {
		fetchTrades();

		// Auto refresh every 30 seconds
		const interval = setInterval(fetchTrades, 30000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold text-white">Trading & History</h2>
				<button onClick={fetchTrades} className="text-gray-400 hover:text-gray-300 text-sm transition-colors">
					Refresh
				</button>
			</div>

			{/* Manual Trading */}
			<div className="bg-gray-800 rounded-lg p-6">
				<h3 className="text-lg font-medium text-white mb-4">Manual Trade</h3>
				<div className="grid grid-cols-2 gap-4 mb-4">
					<div>
						<label className="block text-sm text-gray-400 mb-2">From</label>
						<select
							value={sellToken}
							onChange={(e) => setSellToken(e.target.value)}
							className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							<option value="SOL">SOL</option>
							<option value="USDT">USDT</option>
							<option value="USDC">USDC</option>
						</select>
					</div>
					<div>
						<label className="block text-sm text-gray-400 mb-2">To</label>
						<select
							value={buyToken}
							onChange={(e) => setBuyToken(e.target.value)}
							className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							<option value="USDT">USDT</option>
							<option value="SOL">SOL</option>
							<option value="USDC">USDC</option>
						</select>
					</div>
				</div>

				<div className="flex gap-3">
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
						onClick={executeManualTrade}
						disabled={isTrading || !swapAmount || parseFloat(swapAmount) <= 0}
						className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white py-2 px-6 rounded-lg font-medium transition-colors"
					>
						{isTrading ? 'Trading...' : `Swap ${sellToken} → ${buyToken}`}
					</button>
				</div>
			</div>

			{/* Trade History */}
			<div className="bg-gray-800 rounded-lg p-6">
				<h3 className="text-lg font-medium text-white mb-4">Recent Trades</h3>
				{trades.length > 0 ? (
					<div className="space-y-3">
						{trades.map((trade) => (
							<div key={trade.trade_id} className="border border-gray-700 rounded-lg p-4">
								<div className="flex justify-between items-center mb-2">
									<div className="flex items-center gap-3">
										<span className="text-white font-medium">
											{trade.input_amount.toFixed(4)} {trade.input_token} → {trade.output_amount.toFixed(4)} {trade.output_token}
										</span>
										<span className="text-xs bg-green-900 text-green-300 px-2 py-1 rounded">{trade.status}</span>
										{trade.trade_action && (
											<span className="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded">{trade.trade_action}</span>
										)}
									</div>
									<div className="text-xs text-gray-400">{new Date(trade.timestamp).toLocaleString()}</div>
								</div>
								<div className="flex justify-between text-xs text-gray-400">
									<div className="flex gap-4">
										<span>Price: ${trade.price.toFixed(4)}</span>
										<span>Fee: {trade.fee_sol.toFixed(6)} SOL</span>
									</div>
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
					<p className="text-gray-400 text-center py-8">No trades yet</p>
				)}
			</div>
		</div>
	);
}
