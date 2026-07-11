"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePinLock } from './PinLockContext';
import { useAuth } from './AuthProvider';
import { LockOutlined, DeleteOutlined } from '@ant-design/icons';

// ─── Numpad layout ────────────────────────────────────────────────────────────
const NUMPAD = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['','0','⌫'],
];

export default function PinLockScreen() {
  const { isLocked, unlock, pinLength } = usePinLock();
  const { user } = useAuth();

  const [entered,  setEntered]  = useState('');
  const [error,    setError]    = useState('');
  const [shaking,  setShaking]  = useState(false);
  const [checking, setChecking] = useState(false);
  const submitRef = useRef(false);

  // Auto-submit when PIN is complete
  useEffect(() => {
    if (entered.length === pinLength && !submitRef.current) {
      submitRef.current = true;
      handleSubmit(entered);
    }
  }, [entered, pinLength]);

  const handleSubmit = useCallback(async (pin) => {
    setChecking(true);
    const ok = await unlock(pin);
    setChecking(false);
    submitRef.current = false;
    if (!ok) {
      setShaking(true);
      setError('Wrong PIN. Try again.');
      setEntered('');
      setTimeout(() => { setShaking(false); setError(''); }, 1500);
    }
  }, [unlock]);

  const handleKey = useCallback((key) => {
    if (checking) return;
    if (key === '⌫') {
      setEntered(v => v.slice(0, -1));
      setError('');
    } else if (key === '') {
      return;
    } else {
      setEntered(v => v.length < pinLength ? v + key : v);
    }
  }, [checking, pinLength]);

  // Physical keyboard support
  useEffect(() => {
    if (!isLocked) return;
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace')     handleKey('⌫');
      else if (e.key === 'Enter' && entered.length === pinLength) handleSubmit(entered);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLocked, entered, pinLength, handleKey, handleSubmit]);

  if (!isLocked) return null;

  const userName = user?.name || user?.email || 'User';
  const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      userSelect: 'none',
    }}>
      {/* Decorative blobs */}
      <div style={{
        position: 'absolute', top: -80, left: -80,
        width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -60, right: -60,
        width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 24,
        padding: '40px 36px',
        width: 320,
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
        animation: shaking ? 'pinShake 0.45s ease' : 'pinFadeIn 0.35s ease',
      }}>
        {/* Lock icon */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16, boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
        }}>
          <LockOutlined style={{ color: '#fff', fontSize: 22 }} />
        </div>

        {/* App name */}
        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
          Screen Locked
        </div>

        {/* User avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
          }}>
            {initials}
          </div>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>{userName}</span>
        </div>

        {/* PIN dots */}
        <div style={{
          display: 'flex', gap: 12, marginBottom: 8,
          animation: shaking ? undefined : undefined,
        }}>
          {Array.from({ length: pinLength }).map((_, i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.25)',
              background: i < entered.length ? '#6366f1' : 'transparent',
              boxShadow: i < entered.length ? '0 0 10px rgba(99,102,241,0.6)' : 'none',
              transition: 'background 0.15s ease, box-shadow 0.15s ease',
            }} />
          ))}
        </div>

        {/* Error message */}
        <div style={{
          height: 20, marginBottom: 20, textAlign: 'center',
          color: '#f87171', fontSize: 12, fontWeight: 500,
          opacity: error ? 1 : 0, transition: 'opacity 0.2s ease',
        }}>
          {error || ' '}
        </div>

        {/* Numpad */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {NUMPAD.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {row.map((key, ki) => (
                <button
                  key={ki}
                  onClick={() => handleKey(key)}
                  disabled={key === '' || checking}
                  style={{
                    width: 70, height: 52,
                    borderRadius: 12,
                    border: key === '' ? 'none' : '1px solid rgba(255,255,255,0.12)',
                    background: key === ''
                      ? 'transparent'
                      : key === '⌫'
                      ? 'rgba(239,68,68,0.15)'
                      : 'rgba(255,255,255,0.07)',
                    color: key === '⌫' ? '#f87171' : '#e2e8f0',
                    fontSize: key === '⌫' ? 18 : 20,
                    fontWeight: key === '⌫' ? 400 : 600,
                    cursor: key === '' ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.12s, transform 0.1s',
                    outline: 'none',
                    userSelect: 'none',
                  }}
                  onMouseEnter={e => {
                    if (key !== '') e.currentTarget.style.background = key === '⌫' ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.14)';
                  }}
                  onMouseLeave={e => {
                    if (key !== '') e.currentTarget.style.background = key === '⌫' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)';
                  }}
                  onMouseDown={e => { if (key !== '') e.currentTarget.style.transform = 'scale(0.92)'; }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Hint */}
        <div style={{ marginTop: 20, color: '#475569', fontSize: 11, textAlign: 'center' }}>
          Enter your {pinLength}-digit PIN to unlock
        </div>
      </div>

      {/* Idle hint at bottom */}
      <div style={{ marginTop: 24, color: '#334155', fontSize: 12 }}>
        Auto-locked after 2 minutes of inactivity
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-8px); }
          30%      { transform: translateX(8px); }
          45%      { transform: translateX(-6px); }
          60%      { transform: translateX(6px); }
          75%      { transform: translateX(-3px); }
          90%      { transform: translateX(3px); }
        }
        @keyframes pinFadeIn {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}
