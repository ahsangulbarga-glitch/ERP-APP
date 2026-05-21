'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, ChevronLeft } from 'lucide-react'

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
    const next = [...pin]; next[index] = value; setPin(next)
    if (value && index < 3) pinRefs[index + 1].current?.focus()
  }

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) pinRefs[index - 1].current?.focus()
  }

  const handleNumpad = (digit: string) => {
    const idx = pin.findIndex(d => d === '')
    if (idx === -1) return
    handlePinChange(idx, digit)
  }

  const handleBackspace = () => {
    const idx = [...pin].reverse().findIndex(d => d !== '')
    if (idx === -1) return
    const realIdx = 3 - idx
    const next = [...pin]; next[realIdx] = ''; setPin(next)
    pinRefs[realIdx].current?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const pinStr = pin.join('')
    if (!email) return setError('Email address is required')
    if (!useMasterKey && pinStr.length !== 4) return setError('Please enter your 4-digit PIN')
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

  const numpadKeys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #0f172a 100%)' }}>

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #2563eb, transparent)' }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #2563eb, transparent)' }} />
      </div>

      <div className="relative w-full max-w-[360px] px-4">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}>
            <span className="text-white text-lg font-bold tracking-tight">ERP</span>
          </div>
          <h1 className="text-white text-xl font-bold tracking-tight">ERP System</h1>
          <p className="text-slate-400 text-sm mt-0.5">Enterprise Resource Planning</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(20px)' }}>

          <div className="p-6 space-y-4">
            {/* Email */}
            <div>
              <label className="form-label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                placeholder="you@company.com"
                autoComplete="email"
                inputMode="email"
              />
            </div>

            {!useMasterKey ? (
              <div>
                <label className="form-label">4-Digit PIN</label>
                {/* PIN boxes */}
                <div className="flex justify-center gap-2.5 mb-4">
                  {pin.map((digit, i) => (
                    <input
                      key={i}
                      ref={pinRefs[i]}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handlePinChange(i, e.target.value)}
                      onKeyDown={e => handlePinKeyDown(i, e)}
                      className="pin-digit"
                    />
                  ))}
                </div>

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-2">
                  {numpadKeys.map((k, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => k === '⌫' ? handleBackspace() : k && handleNumpad(k)}
                      className={`h-11 rounded-xl font-semibold text-base transition-all duration-100 select-none ${
                        k === '' ? 'invisible' :
                        k === '⌫' ? 'bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 border border-red-100' :
                        'bg-slate-50 text-slate-800 hover:bg-blue-50 hover:text-blue-700 active:scale-95 border border-slate-200 hover:border-blue-200 shadow-sm'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <Shield size={12} className="text-amber-500" /> Admin Master Key
                </label>
                <input
                  type="password"
                  value={masterKey}
                  onChange={e => setMasterKey(e.target.value)}
                  className="form-input"
                  placeholder="Enter master key"
                />
              </div>
            )}

            {/* Toggle */}
            <button
              type="button"
              onClick={() => { setUseMasterKey(!useMasterKey); setPin(['','','','']); setMasterKey('') }}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors"
            >
              {useMasterKey ? <><ChevronLeft size={12} /> Use PIN instead</> : <><Shield size={12} /> Admin Master Key Override</>}
            </button>

            {/* Error */}
            {error && (
              <div className="rounded-lg px-3 py-2.5 text-sm font-medium"
                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                {error}
              </div>
            )}
          </div>

          {/* Submit footer */}
          <div className="px-6 pb-6">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 4px 14px rgba(37,99,235,0.4)' }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </button>
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-5">
          Secure access · ERP System v2
        </p>
      </div>
    </div>
  )
}
