'use client';

import { useEffect, useState } from 'react';

interface TradingStatus {
	automated_trading: boolean;
	strategy: string;
	price_tracking?: boolean;
}

interface StrategyTabProps {
	tradingStatus: TradingStatus | null;
	onRefresh: () => void;
}

interface Strategy {
	id: string;
	name: string;
	risk_level: string;
	max_position_size: number;
	stop_loss_percent: number;
	take_profit_percent: number;
	is_active: boolean;
}

interface Position {
	id: string;
	token_pair: string;
	position_type: string;
	entry_price: number;
	amount: number;
	target_profit_price: number;
	stop_loss_price: number;
}

export function StrategyTab({ tradingStatus, onRefresh }: StrategyTabProps) {
	const [strategies, setStrategies] = useState<Strategy[]>([]);
	const [positions, setPositions] = useState<Position[]>([]);

	// Fetch available strategies
	const fetchStrategies = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/strategy`);
			if (response.ok) {
				const data = await response.json();
				setStrategies(data.strategies || []);
			}
		} catch (error) {
			console.error('Error fetching strategies:', error);
		}
	};

	// Fetch open positions
	const fetchPositions = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/positions`);
			if (response.ok) {
				const data = await response.json();
				setPositions(data.positions || []);
			}
		} catch (error) {
			console.error('Error fetching positions:', error);
		}
	};

	// Start automated trading
	const startTrading = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/start-automated-trading`, {
				method: 'POST',
			});
			if (response.ok) {
				alert('✅ Automated trading started!');
				onRefresh();
			}
		} catch (error) {
			console.error('Error starting trading:', error);
		}
	};

	// Stop automated trading
	const stopTrading = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/stop-automated-trading`, {
				method: 'POST',
			});
			if (response.ok) {
				alert('🛑 Automated trading stopped!');
				onRefresh();
			}
		} catch (error) {
			console.error('Error stopping trading:', error);
		}
	};

	useEffect(() => {
		fetchStrategies();
		fetchPositions();
	}, []);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold text-white">Strategy Management</h2>
				<button onClick={onRefresh} className="text-gray-400 hover:text-gray-300 text-sm transition-colors">
					Refresh
				</button>
			</div>

			{/* Trading Controls */}
			<div className="bg-gray-800 rounded-lg p-6">
				<h3 className="text-lg font-medium text-white mb-4">Automated Trading</h3>
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-3">
						<div className={`w-3 h-3 rounded-full ${tradingStatus?.automated_trading ? 'bg-green-400' : 'bg-red-400'}`} />
						<span className="text-white font-medium">{tradingStatus?.automated_trading ? 'Running' : 'Stopped'}</span>
						<span className="text-gray-400">({tradingStatus?.strategy || 'No strategy'})</span>
					</div>
					<div className="flex gap-3">
						{!tradingStatus?.automated_trading ? (
							<button
								onClick={startTrading}
								className="bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
							>
								🚀 Start Trading
							</button>
						) : (
							<button
								onClick={stopTrading}
								className="bg-red-600 hover:bg-red-500 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
							>
								🛑 Stop Trading
							</button>
						)}
					</div>
				</div>

				{/* Strategy Description */}
				<div className="bg-gray-700 rounded-lg p-4">
					<h4 className="text-white font-medium mb-2">Current Strategy: Conservative</h4>
					<div className="text-sm text-gray-300 space-y-1">
						<p>• Buy when price drops 0.5% below 5-minute average</p>
						<p>• Sell at 0.5% profit or 2% stop loss</p>
						<p>• Use 5% of bot wallet per trade</p>
						<p>• Check every 30 seconds with new price data</p>
					</div>
				</div>
			</div>

			{/* Available Strategies */}
			<div className="bg-gray-800 rounded-lg p-6">
				<h3 className="text-lg font-medium text-white mb-4">Available Strategies</h3>
				<div className="space-y-3">
					{strategies.map((strategy) => (
						<div
							key={strategy.id}
							className={`border rounded-lg p-4 ${
								strategy.is_active ? 'border-green-600 bg-green-900/20' : 'border-gray-600 bg-gray-700/50'
							}`}
						>
							<div className="flex justify-between items-center">
								<div>
									<h4 className="text-white font-medium">{strategy.name}</h4>
									<div className="text-sm text-gray-400 mt-1">
										{strategy.risk_level} risk • {strategy.max_position_size}% max position •{strategy.stop_loss_percent}% stop loss •{' '}
										{strategy.take_profit_percent}% take profit
									</div>
								</div>
								<div className="flex items-center gap-2">
									{strategy.is_active && <span className="text-green-400 text-sm">Active</span>}
									<div className={`w-2 h-2 rounded-full ${strategy.is_active ? 'bg-green-400' : 'bg-gray-400'}`} />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Open Positions */}
			<div className="bg-gray-800 rounded-lg p-6">
				<h3 className="text-lg font-medium text-white mb-4">Open Positions</h3>
				{positions.length > 0 ? (
					<div className="space-y-3">
						{positions.map((position) => (
							<div key={position.id} className="border border-gray-600 rounded-lg p-4">
								<div className="flex justify-between items-center">
									<div>
										<span className="text-white font-medium">{position.token_pair}</span>
										<span className="text-gray-400 ml-2">({position.position_type})</span>
									</div>
									<div className="text-right">
										<div className="text-white">${position.entry_price}</div>
										<div className="text-sm text-gray-400">{position.amount} SOL</div>
									</div>
								</div>
								<div className="flex justify-between mt-2 text-sm">
									<span className="text-green-400">Target: ${position.target_profit_price}</span>
									<span className="text-red-400">Stop: ${position.stop_loss_price}</span>
								</div>
							</div>
						))}
					</div>
				) : (
					<p className="text-gray-400 text-center py-4">No open positions</p>
				)}
			</div>
		</div>
	);
}
