import { WalletConnection } from '@/components/wallet/WalletConnection'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
            🤖 <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Solana</span> Trading Bot
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            Professional meme token trading bot with advanced risk management,
            real-time profit tracking, and automated strategies
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {/* Wallet Connection */}
          <WalletConnection />
          {/* System Status */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <span className="text-3xl">🚀</span> System Status
            </h2>
            <div className="space-y-4">
              <StatusItem label="Next.js 15 + Turbopack" status="ready" />
              <StatusItem label="TypeScript" status="ready" />
              <StatusItem label="PostgreSQL 16" status="ready" />
              <StatusItem label="Docker Database" status="ready" />
              <StatusItem label="API Routes" status="ready" />
              <StatusItem label="Wallet Integration" status="ready" />
            </div>
          </div>

          {/* Bot Configuration */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <span className="text-3xl">⚙️</span> Bot Config
            </h2>
            <div className="space-y-4">
              <ConfigItem label="Strategy" value="Conservative" />
              <ConfigItem label="Max Position" value="5.0 SOL" />
              <ConfigItem label="Stop Loss" value="3%" />
              <ConfigItem label="Take Profit" value="10%" />
              <ConfigItem label="Status" value="Stopped" color="red" />
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 hover:bg-white/15 transition-all duration-300 lg:col-span-2 xl:col-span-1">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
              <span className="text-3xl">📊</span> Performance
            </h2>
            <div className="space-y-4">
              <MetricItem label="Total P&L" value="+0.00 SOL" color="green" />
              <MetricItem label="Win Rate" value="0%" />
              <MetricItem label="Total Trades" value="0" />
              <MetricItem label="Active Positions" value="0" />
              <MetricItem label="Uptime" value="00:00:00" />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
          <button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg">
            🚀 Start Trading Bot
          </button>
          <button className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg">
            ⚙️ Configure Strategy
          </button>
        </div>

        {/* Footer */}
        <div className="mt-16 text-center">
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 max-w-4xl mx-auto">
            <h3 className="text-lg font-semibold mb-3 text-white">⚠️ Important Disclaimer</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Trading cryptocurrencies involves substantial risk of loss and is not suitable for all investors.
              This bot is for educational purposes. Only trade with money you can afford to lose.
              Past performance is not indicative of future results.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

// Helper Components
function StatusItem({ label, status }: { label: string; status: 'ready' | 'building' | 'pending' }) {
  const statusConfig = {
    ready: { color: 'text-green-400', icon: '✅', text: 'Ready' },
    building: { color: 'text-yellow-400', icon: '🔄', text: 'Building...' },
    pending: { color: 'text-orange-400', icon: '⏳', text: 'Pending' }
  }

  const config = statusConfig[status]

  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-300">{label}</span>
      <span className={`${config.color} flex items-center gap-1 font-medium`}>
        <span>{config.icon}</span>
        {config.text}
      </span>
    </div>
  )
}

function ConfigItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-300">{label}</span>
      <span className={`font-medium ${color === 'red' ? 'text-red-400' : 'text-white'}`}>
        {value}
      </span>
    </div>
  )
}

function MetricItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-300">{label}</span>
      <span className={`font-medium ${color === 'green' ? 'text-green-400' : 'text-white'}`}>
        {value}
      </span>
    </div>
  )
}
