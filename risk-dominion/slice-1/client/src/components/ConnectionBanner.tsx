import { SPACETIMEDB_URI } from '../constants';

interface ConnectionBannerProps {
  connectionError: string | null;
}

/**
 * Non-blocking banner shown when the client cannot reach SpacetimeDB.
 * Surfaces what would otherwise be a silent console-only error (Issue #5)
 * with an actionable message pointing at SETUP.md.
 */
export default function ConnectionBanner({ connectionError }: ConnectionBannerProps) {
  if (!connectionError) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(120,20,20,0.95)',
        borderBottom: '1px solid #FF4444',
        color: '#FFE0E0',
        padding: '10px 20px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '12px',
        lineHeight: 1.5,
        textAlign: 'center',
        zIndex: 10000,
      }}
    >
      <span style={{ color: '#FF8888', fontWeight: 700 }}>Cannot connect to SpacetimeDB</span>
      {' at '}
      <span style={{ color: '#FFD0D0' }}>{SPACETIMEDB_URI}</span>
      {'. Is the server running and the module published? See SETUP.md.'}
      <span style={{ display: 'block', color: '#FFB0B0', opacity: 0.8, marginTop: '2px' }}>
        {connectionError}
      </span>
    </div>
  );
}
