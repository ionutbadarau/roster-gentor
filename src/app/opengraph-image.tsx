import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'PlanGarzi — Planificare Gărzi și Ture pentru Medici';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #4f46e5 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '14px',
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1e3a8a',
              fontSize: '36px',
              fontWeight: 800,
              letterSpacing: '-1px',
            }}
          >
            PG
          </div>
          <div style={{ color: 'white', fontSize: '36px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            PlanGarzi
          </div>
        </div>

        <div
          style={{
            color: 'white',
            fontSize: '76px',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-2px',
            maxWidth: '1000px',
          }}
        >
          Planificare Gărzi și Ture
        </div>

        <div
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: '34px',
            fontWeight: 500,
            marginTop: '28px',
            maxWidth: '1000px',
            lineHeight: 1.3,
          }}
        >
          Generează programul lunar al spitalului automat — echitabil, conform legii.
        </div>

        <div
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: '26px',
            marginTop: '40px',
            display: 'flex',
            gap: '32px',
          }}
        >
          <span>plangarzi.ro</span>
          <span>•</span>
          <span>Export PDF / Excel</span>
          <span>•</span>
          <span>Detectare conflicte</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
