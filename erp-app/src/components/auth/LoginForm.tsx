'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState(['', '', '', ''])
  const [useMasterKey, setUseMasterKey] = useState(false)
  const [masterKey, setMasterKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pinRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const next = [...pin]
    next[index] = value
    setPin(next)
    if (value && index < 3) pinRefs[index + 1].current?.focus()
  }

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs[index - 1].current?.focus()
    }
  }

  const handleNumpad = (digit: string) => {
    const idx = pin.findIndex((d) => d === '')
    if (idx === -1) return
    handlePinChange(idx, digit)
  }

  const handleClear = () => {
    setPin(['', '', '', ''])
    pinRefs[0].current?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const pinStr = pin.join('')
    if (!email) return setError('Email is required')
    if (!useMasterKey && pinStr.length !== 4) return setError('Enter your 4-digit PIN')

    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin: useMasterKey ? undefined : pinStr, masterKey: useMasterKey ? masterKey : undefined }),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.error || 'Login failed')
      router.push('/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo / Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
          <span className="text-white text-2xl font-bold">ERP</span>
        </div>
        <h1 className="text-white text-2xl font-bold">ERP System</h1>
        <p className="text-slate-400 text-sm mt-1">Enterprise Resource Planning</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-6 space-y-5">
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@company.com"
            autoComplete="email"
            inputMode="email"
          />
        </div>

        {!useMasterKey ? (
          <>
            {/* PIN Boxes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">4-Digit PIN</label>
              <div className="flex justify-center gap-3 mb-4">
                {pin.map((digit, i) => (
                  <input
                    key={i}
                    ref={pinRefs[i]}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinChange(i, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(i, e)}
                    className="pin-digit"
                  />
                ))}
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => k === '⌫' ? handleClear() : k && handleNumpad(k)}
                    className={`h-12 rounded-lg font-semibold text-lg transition-colors ${
                      k === ''
                        ? 'invisible'
                        : k === '⌫'
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        : 'bg-slate-50 text-slate-800 hover:bg-blue-50 hover:text-blue-700 border border-slate-200'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Admin Master Key</label>
            <input
              type="password"
              value={masterKey}
              onChange={(e) => setMasterKey(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter master key"
            />
          </div>
        )}

        {/* Toggle Master Key */}
        <button
          type="button"
          onClick={() => { setUseMasterKey(!useMasterKey); setPin(['','','','']); setMasterKey('') }}
          className="text-xs text-slate-400 hover:text-blue-600 transition-colors"
        >
          {useMasterKey ? '← Use PIN instead' : 'Admin Master Key Override →'}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors shadow-md"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}
