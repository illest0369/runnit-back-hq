'use client'

import { useState } from 'react'

interface User { id: string; username: string; role: string; created_at: string }
interface Channel { id: string; name: string; handle: string; category: string }

const API = process.env.NEXT_PUBLIC_API_URL || 'https://clip-worker-production-6e2f.up.railway.app'

const CAT_BADGE: Record<string, string> = {
  sports:        'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  gaming:        'text-purple-400 bg-purple-400/10 border-purple-400/25',
  combat:        'text-error bg-error/10 border-error/25',
  womens_sports: 'text-pink-400 bg-pink-400/10 border-pink-400/25',
}

export default function AdminClient({ users, channels, currentUserId }: {
  users: User[]
  channels: Channel[]
  currentUserId: string
}) {
  const [modalUser, setModalUser] = useState<{ id: string; username: string } | null>(null)
  const [newPin, setNewPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function openModal(userId: string, username: string) {
    setModalUser({ id: userId, username })
    setNewPin('')
    setError('')
    setSaved(false)
  }

  function closeModal() {
    setModalUser(null)
    setNewPin('')
    setSaving(false)
    setSaved(false)
    setError('')
  }

  async function handlePinChange() {
    if (!modalUser) return
    if (newPin.length < 6) { setError('PIN must be exactly 6 digits'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/admin/users/${modalUser.id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: newPin })
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => closeModal(), 800)
      } else {
        setError('Failed to update PIN')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {/* OPERATORS section */}
      <div className="mb-9">
        <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.14em] mb-3">OPERATORS</p>
        <div className="flex flex-col gap-1.5">
          {users.map(user => (
            <div
              key={user.id}
              className={[
                'flex items-center justify-between bg-surface-container-low rounded px-4 py-3.5',
                user.id === currentUserId ? 'border-l-2 border-primary-container' : 'border-l-2 border-transparent',
              ].join(' ')}
            >
              <div className="flex items-center gap-2.5">
                <span className="font-headline font-black text-[13px] text-on-surface uppercase tracking-[0.02em]">
                  {user.username}
                </span>
                <span className={[
                  'font-headline font-black text-[9px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full',
                  user.role === 'admin'
                    ? 'text-primary-container bg-primary-container/10 border border-primary-container/25'
                    : 'text-on-surface-variant bg-surface-container-highest border border-transparent',
                ].join(' ')}>
                  {user.role}
                </span>
                {user.id === currentUserId && (
                  <span className="font-headline text-[9px] text-on-surface-variant tracking-[0.08em]">YOU</span>
                )}
              </div>
              <button
                onClick={() => openModal(user.id, user.username)}
                className="font-headline font-black text-[9px] text-secondary border border-outline-variant rounded px-3 py-1.5 cursor-pointer uppercase tracking-[0.08em] bg-transparent hover:border-primary-container/50 transition-colors"
              >
                CHANGE PIN
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* CHANNELS section */}
      <div className="mb-8">
        <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.14em] mb-3">CHANNELS</p>
        <div className="flex flex-col gap-1.5">
          {channels.map(ch => {
            const badgeCls = CAT_BADGE[ch.category] ?? 'text-on-surface-variant bg-surface-container-highest border-transparent'
            return (
              <div key={ch.id} className="flex items-center justify-between bg-surface-container-low rounded px-4 py-3.5">
                <div>
                  <span className="font-headline font-black text-[13px] text-on-surface">{ch.name}</span>
                  <span className="font-headline text-[10px] text-on-surface-variant ml-2">@{ch.handle}</span>
                </div>
                <span className={`font-headline font-black text-[9px] uppercase tracking-[0.1em] px-2.5 py-1 rounded-full border ${badgeCls}`}>
                  {ch.category.replace('_', ' ')}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* PIN Change Modal */}
      {modalUser && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-6">
          <div className="bg-surface border border-outline-variant rounded-xl p-7 w-full max-w-xs">
            <p className="font-headline font-bold text-[9px] text-on-surface-variant uppercase tracking-[0.14em] mb-1">OPERATOR PIN</p>
            <h3 className="font-headline font-black text-xl text-on-surface uppercase tracking-tight mb-5">
              {modalUser.username.toUpperCase()}
            </h3>

            <p className="font-headline text-[10px] text-on-surface-variant tracking-[0.08em] mb-3">NEW 6-DIGIT PIN</p>

            <input
              type="password"
              placeholder="••••••"
              value={newPin}
              onChange={e => setNewPin(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
              className={[
                'w-full bg-surface-container-low border-t-0 border-x-0 rounded-t px-4 py-3.5 text-on-surface text-2xl font-mono tracking-[0.5em] text-center outline-none mb-2',
                error ? 'border-b border-error' : 'border-b border-outline-variant',
              ].join(' ')}
            />

            {/* PIN dots */}
            <div className="flex gap-1.5 justify-center mb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={[
                    'w-1.5 h-1.5 rounded-full transition-colors duration-150',
                    i < newPin.length ? 'bg-primary-container' : 'bg-surface-container-highest',
                  ].join(' ')}
                />
              ))}
            </div>

            {error && (
              <p className="font-headline text-[10px] text-error mb-3 tracking-[0.06em]">{error}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 py-3 bg-transparent border border-outline-variant rounded font-headline font-black text-[11px] text-on-surface-variant cursor-pointer uppercase tracking-[0.08em]"
              >
                CANCEL
              </button>
              <button
                onClick={handlePinChange}
                disabled={newPin.length < 6 || saving}
                className={[
                  'flex-1 py-3 border-none rounded font-headline font-black text-[11px] uppercase tracking-[0.08em] transition-colors',
                  saved
                    ? 'bg-emerald-400 text-black cursor-pointer'
                    : newPin.length >= 6 && !saving
                    ? 'bg-primary-container text-on-primary cursor-pointer'
                    : 'bg-surface-container-highest text-on-surface-variant cursor-not-allowed',
                ].join(' ')}
              >
                {saving ? '...' : saved ? '✓ SAVED' : 'SAVE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
