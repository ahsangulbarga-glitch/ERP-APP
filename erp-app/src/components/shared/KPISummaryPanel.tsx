'use client'

interface KPI {
  label: string
  value: string | number
  sub?: string
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'cyan'
  icon?: React.ReactNode
}

const colorConfig = {
  blue:   { bar: '#2563eb', bg: '#eff6ff', text: '#1d4ed8', sub: '#93c5fd', border: '#bfdbfe' },
  green:  { bar: '#16a34a', bg: '#f0fdf4', text: '#15803d', sub: '#86efac', border: '#bbf7d0' },
  red:    { bar: '#dc2626', bg: '#fef2f2', text: '#b91c1c', sub: '#fca5a5', border: '#fecaca' },
  orange: { bar: '#ea580c', bg: '#fff7ed', text: '#c2410c', sub: '#fdba74', border: '#fed7aa' },
  purple: { bar: '#7c3aed', bg: '#f5f3ff', text: '#6d28d9', sub: '#c4b5fd', border: '#ddd6fe' },
  cyan:   { bar: '#0891b2', bg: '#ecfeff', text: '#0e7490', sub: '#67e8f9', border: '#a5f3fc' },
}

export default function KPISummaryPanel({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="kpi-panel">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => {
          const c = colorConfig[kpi.color || 'blue']
          return (
            <div key={i} className="kpi-card" style={{
              background: c.bg,
              borderColor: c.border,
              '--accent': c.bar,
            } as React.CSSProperties}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                height: '3px', background: c.bar,
                borderRadius: '14px 14px 0 0',
              }} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: c.text, opacity: 0.75, letterSpacing: '0.02em' }}>
                    {kpi.label}
                  </p>
                  <p className="text-xl font-bold mt-1 tracking-tight truncate" style={{ color: c.text }}>
                    {kpi.value}
                  </p>
                  {kpi.sub && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: c.sub }}>
                      {kpi.sub}
                    </p>
                  )}
                </div>
                {kpi.icon && (
                  <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${c.bar}18` }}>
                    <span style={{ color: c.bar }}>{kpi.icon}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
