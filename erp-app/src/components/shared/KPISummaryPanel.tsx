'use client'

interface KPI {
  label: string
  value: string | number
  sub?: string
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple'
}

export default function KPISummaryPanel({ kpis }: { kpis: KPI[] }) {
  const colorMap = {
    blue: 'text-blue-700 bg-blue-50 border-blue-100',
    green: 'text-green-700 bg-green-50 border-green-100',
    red: 'text-red-700 bg-red-50 border-red-100',
    orange: 'text-orange-700 bg-orange-50 border-orange-100',
    purple: 'text-purple-700 bg-purple-50 border-purple-100',
  }

  return (
    <div className="kpi-panel bg-white border-b border-slate-200 px-4 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <div key={i} className={`kpi-card border ${colorMap[kpi.color || 'blue']}`}>
            <p className="text-xs font-medium opacity-70 truncate">{kpi.label}</p>
            <p className="text-lg font-bold mt-0.5 truncate">{kpi.value}</p>
            {kpi.sub && <p className="text-xs opacity-60 mt-0.5">{kpi.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
