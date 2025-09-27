'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useCallback, useEffect, useState } from 'react';

// Tab components
import { PriceTab } from './tabs/PriceTab';
import { StrategyTab } from './tabs/StrategyTab';
import { TradesTab } from './tabs/TradesTab';
import { WalletTab } from './tabs/WalletTab';

type TabType = 'wallet' | 'strategy' | 'prices' | 'trades';

interface BotWalletInfo {
	address: string;
	balanceSOL: number;
	balanceUSDT: number;
	balanceUSDC: number;
	tokens: Record<string, number>;
	activeTokens: Record<string, number>;
}

interface TradingStatus {
	price_tracking: boolean;
	automated_trading: boolean;
	strategy: string;
}

export function TradingDashboard() {
	const { connected, publicKey } = useWallet();
	const [activeTab, setActiveTab] = useState<TabType>('wallet');
	const [userBalance, setUserBalance] = useState<number | null>(null);
	const [botWalletInfo, setBotWalletInfo] = useState<BotWalletInfo | null>(null);
	const [tradingStatus, setTradingStatus] = useState<TradingStatus | null>(null);

	// Fetch user balance
	const fetchUserBalance = useCallback(async () => {
		if (connected && publicKey) {
			try {
				const response = await fetch(
					`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/balance/${publicKey.toString()}`
				);
				if (response.ok) {
					const data = await response.json();
					setUserBalance(data.balance || 0);
				}
			} catch (error) {
				console.error('Error fetching user balance:', error);
			}
		}
	}, [connected, publicKey]);

	// Fetch bot wallet info
	const fetchBotWalletInfo = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/bot-wallet-live`);
			if (response.ok) {
				const data = await response.json();
				setBotWalletInfo(data.wallet);
			}
		} catch (error) {
			console.error('Error fetching bot wallet:', error);
		}
	};

	// Fetch trading status
	const fetchTradingStatus = async () => {
		try {
			const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/wallet/trading-status`);
			if (response.ok) {
				const data = await response.json();
				setTradingStatus(data);
			}
		} catch (error) {
			console.error('Error fetching trading status:', error);
		}
	};

	// Fetch data when connected
	useEffect(() => {
		if (connected && publicKey) {
			fetchUserBalance();
			fetchBotWalletInfo();
			fetchTradingStatus();
		}
	}, [connected, publicKey, fetchUserBalance]);

	// Auto refresh every 30 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			if (connected && publicKey) {
				fetchUserBalance();
				fetchBotWalletInfo();
				fetchTradingStatus();
			}
		}, 30000);

		return () => clearInterval(interval);
	}, [connected, publicKey, fetchUserBalance]);

	const tabs = [
		{ id: 'wallet' as TabType, name: 'Wallet', icon: '💰' },
		{ id: 'strategy' as TabType, name: 'Strategy', icon: '🤖' },
		{ id: 'prices' as TabType, name: 'Prices', icon: '📊' },
		{ id: 'trades' as TabType, name: 'Trades', icon: '📈' },
	];

	return (
		<div className="min-h-screen bg-black">
			<div className="max-w-6xl mx-auto p-6">
				{/* Header */}
				<div className="text-center mb-8">
					<h1 className="text-3xl font-bold text-white mb-2">Trading Bot Dashboard</h1>
					<p className="text-gray-400">Monitor your automated Solana trading</p>
				</div>

				{/* Wallet Connection */}
				<div className="flex justify-center mb-8">
					<WalletMultiButton className="!bg-white !text-black hover:!bg-gray-100 !rounded-xl !font-semibold !px-8 !py-3 !text-base !border-0 !transition-all !duration-200" />
				</div>

				{connected && publicKey ? (
					<>
						{/* Status Bar */}
						<div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
							<div className="flex justify-between items-center">
								<div className="flex items-center gap-6">
									<div className="flex items-center gap-2">
										<div className={`w-2 h-2 rounded-full ${tradingStatus?.price_tracking ? 'bg-green-400' : 'bg-red-400'}`} />
										<span className="text-sm text-gray-300">Price Tracking</span>
									</div>
									<div className="flex items-center gap-2">
										<div className={`w-2 h-2 rounded-full ${tradingStatus?.automated_trading ? 'bg-green-400' : 'bg-red-400'}`} />
										<span className="text-sm text-gray-300">Auto Trading</span>
									</div>
									<div className="text-sm text-gray-400">Strategy: {tradingStatus?.strategy || 'None'}</div>
								</div>
								<div className="flex items-center gap-4 text-sm">
									<span className="text-gray-400">Your Balance:</span>
									<span className="text-white font-semibold">{userBalance?.toFixed(4) || '0.0000'} SOL</span>
									<span className="text-gray-400">Bot Balance:</span>
									<span className="text-green-400 font-semibold">{botWalletInfo?.balanceSOL?.toFixed(4) || '0.0000'} SOL</span>
								</div>
							</div>
						</div>

						{/* Tab Navigation */}
						<div className="bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6">
							<div className="flex gap-1">
								{tabs.map((tab) => (
									<button
										key={tab.id}
										onClick={() => setActiveTab(tab.id)}
										className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
											activeTab === tab.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-300'
										}`}
									>
										<span>{tab.icon}</span>
										<span>{tab.name}</span>
									</button>
								))}
							</div>
						</div>

						{/* Tab Content */}
						<div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
							{activeTab === 'wallet' && (
								<WalletTab
									userBalance={userBalance}
									botWalletInfo={botWalletInfo}
									onRefresh={() => {
										fetchUserBalance();
										fetchBotWalletInfo();
									}}
								/>
							)}
							{activeTab === 'strategy' && <StrategyTab tradingStatus={tradingStatus} onRefresh={fetchTradingStatus} />}
							{activeTab === 'prices' && <PriceTab />}
							{activeTab === 'trades' && <TradesTab />}
						</div>
					</>
				) : (
					<div className="text-center py-16">
						<p className="text-gray-400 text-lg">Connect your Solana wallet to access the trading dashboard</p>
					</div>
				)}
			</div>
		</div>
	);
}
