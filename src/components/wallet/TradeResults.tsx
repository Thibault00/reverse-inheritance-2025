'use client';

interface TradeResultsProps {
	lastTrade: {
		result: {
			trade1: { type: string; amount: number; usdtReceived: number; price: number };
			trade2: { type: string; amount: number; solReceived: number; price: number };
			profit: number;
			executionTime: number;
			signatures: string[];
			status: string;
		};
	} | null;
}

export function TradeResults({ lastTrade }: TradeResultsProps) {
	if (!lastTrade || !lastTrade.result) return null;

	return (
		<div className="bg-white/5 rounded-lg p-4">
			<h3 className="text-lg font-semibold text-white mb-3">📈 Last Automated Trade</h3>
			<div className="space-y-2 text-sm">
				<div className="flex justify-between">
					<span className="text-gray-300">Trade 1:</span>
					<span className="text-green-400">
						{lastTrade.result.trade1?.type} {lastTrade.result.trade1?.amount?.toFixed(6)} SOL → USDT
					</span>
				</div>
				<div className="flex justify-between">
					<span className="text-gray-300">Trade 2:</span>
					<span className="text-blue-400">{lastTrade.result.trade2?.type} USDT → SOL</span>
				</div>
				<div className="flex justify-between">
					<span className="text-gray-300">Result:</span>
					<span className={lastTrade.result.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
						{lastTrade.result.profit >= 0 ? '+' : ''}
						{lastTrade.result.profit?.toFixed(6)} SOL
					</span>
				</div>
				<div className="flex justify-between">
					<span className="text-gray-300">Status:</span>
					<span className="text-white">{lastTrade.result.status}</span>
				</div>

				{lastTrade.result.signatures && lastTrade.result.signatures.length > 0 && (
					<div className="mt-2">
						<span className="text-gray-300 text-xs">Signatures:</span>
						{lastTrade.result.signatures.map((sig: string, idx: number) => (
							<div key={idx} className="text-blue-400 text-xs break-all">
								<a href={`https://solscan.io/tx/${sig}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
									{sig.slice(0, 8)}...{sig.slice(-8)} ↗
								</a>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
