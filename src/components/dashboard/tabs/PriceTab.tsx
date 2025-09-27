'use client';

import { useEffect, useState } from 'react';

interface PriceData {
	token_pair: string;
	price: number;
	source: string;
	timestamp: string;
}

export function PriceTab() {
	const [priceData, setPriceData] = useState<PriceData[]>([]);
	const [trackingStatus, setTrackingStatus] = useState<any>(null);

	// Fetch recent prices
	const fetchPriceData = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/price-data?limit=20`);
			if (response.ok) {
				const data = await response.json();
				setPriceData(data.prices || []);
			}
		} catch (error) {
			console.error('Error fetching price data:', error);
		}
	};

	// Fetch tracking status
	const fetchTrackingStatus = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/price-tracking-status`);
			if (response.ok) {
				const data = await response.json();
				setTrackingStatus(data);
			}
		} catch (error) {
			console.error('Error fetching tracking status:', error);
		}
	};

	// Start price tracking
	const startTracking = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/start-price-tracking`, {
				method: 'POST',
			});
			if (response.ok) {
				alert('✅ Price tracking started!');
				fetchTrackingStatus();
			}
		} catch (error) {
			console.error('Error starting tracking:', error);
		}
	};

	// Stop price tracking
	const stopTracking = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/stop-price-tracking`, {
				method: 'POST',
			});
			if (response.ok) {
				alert('🛑 Price tracking stopped!');
				fetchTrackingStatus();
			}
		} catch (error) {
			console.error('Error stopping tracking:', error);
		}
	};

	useEffect(() => {
		fetchPriceData();
		fetchTrackingStatus();

		// Auto refresh every 30 seconds
		const interval = setInterval(() => {
			fetchPriceData();
			fetchTrackingStatus();
		}, 30000);

		return () => clearInterval(interval);
	}, []);

	const currentPrice = priceData[0]?.price;
	const previousPrice = priceData[1]?.price;
	const priceChange = currentPrice && previousPrice ? currentPrice - previousPrice : 0;
	const priceChangePercent = previousPrice ? (priceChange / previousPrice) * 100 : 0;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold text-white">Price Monitoring</h2>
				<button
					onClick={() => {
						fetchPriceData();
						fetchTrackingStatus();
					}}
					className="text-gray-400 hover:text-gray-300 text-sm transition-colors"
				>
					Refresh
				</button>
			</div>

			{/* Price Tracking Status */}
			<div className="bg-gray-800 rounded-lg p-6">
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-lg font-medium text-white">Price Tracking</h3>
					<div className="flex gap-3">
						{!trackingStatus?.is_running ? (
							<button
								onClick={startTracking}
								className="bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
							>
								🚀 Start Tracking
							</button>
						) : (
							<button
								onClick={stopTracking}
								className="bg-red-600 hover:bg-red-500 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors"
							>
								🛑 Stop Tracking
							</button>
						)}
					</div>
				</div>

				<div className="flex items-center gap-4">
					<div className={`w-3 h-3 rounded-full ${trackingStatus?.is_running ? 'bg-green-400' : 'bg-red-400'}`} />
					<span className="text-white font-medium">{trackingStatus?.is_running ? 'Tracking Active' : 'Tracking Stopped'}</span>
					<span className="text-gray-400">• Updates every 30 seconds</span>
				</div>
			</div>

			{/* Current Price */}
			{currentPrice && (
				<div className="bg-gray-800 rounded-lg p-6">
					<h3 className="text-lg font-medium text-white mb-4">SOL/USDT Current Price</h3>
					<div className="flex items-center gap-6">
						<div className="text-center">
							<div className="text-4xl font-bold text-white">${currentPrice.toFixed(4)}</div>
							<div className="text-sm text-gray-400">Current Price</div>
						</div>
						<div className="text-center">
							<div className={`text-2xl font-bold ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
								{priceChange >= 0 ? '+' : ''}${priceChange.toFixed(4)}
							</div>
							<div className="text-sm text-gray-400">Change</div>
						</div>
						<div className="text-center">
							<div className={`text-2xl font-bold ${priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
								{priceChangePercent >= 0 ? '+' : ''}
								{priceChangePercent.toFixed(2)}%
							</div>
							<div className="text-sm text-gray-400">Percent</div>
						</div>
					</div>
				</div>
			)}

			{/* Recent Prices */}
			<div className="bg-gray-800 rounded-lg p-6">
				<h3 className="text-lg font-medium text-white mb-4">Recent Prices</h3>
				<div className="space-y-2 max-h-64 overflow-y-auto">
					{priceData.map((price, index) => (
						<div key={index} className="flex justify-between items-center py-2 border-b border-gray-700 last:border-b-0">
							<div className="flex items-center gap-3">
								<span className="text-white font-medium">${price.price.toFixed(4)}</span>
								<span className="text-gray-400 text-sm">{price.token_pair}</span>
							</div>
							<div className="text-right">
								<div className="text-gray-400 text-sm">{new Date(price.timestamp).toLocaleTimeString()}</div>
								<div className="text-gray-500 text-xs">{price.source}</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
