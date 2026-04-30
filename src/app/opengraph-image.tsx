import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'PlanGarzi — Planificare Gărzi și Ture pentru Medici';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadFont(weight: number): Promise<ArrayBuffer> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  ).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\) format/)?.[1];
  if (!url) throw new Error('Inter font URL not found');
  return fetch(url).then((r) => r.arrayBuffer());
}

export default async function OpengraphImage() {
  const [inter500, inter700, inter800] = await Promise.all([
    loadFont(500),
    loadFont(700),
    loadFont(800),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '64px',
          background:
            'linear-gradient(135deg, #0A3D31 0%, #0F6E56 55%, #1D9E75 100%)',
          fontFamily: 'Inter',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: '#5DCAA5',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0F6E56',
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: '-1px',
            }}
          >
            PG
          </div>
          <div
            style={{
              color: 'white',
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '-0.5px',
            }}
          >
            PlanGarzi
          </div>
        </div>

        <div
          style={{
            color: 'white',
            fontSize: 84,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-2px',
            marginTop: 'auto',
            maxWidth: 960,
            display: 'flex',
          }}
        >
          Planificare Gărzi și Ture
        </div>

        <div
          style={{
            color: 'rgba(255,255,255,0.88)',
            fontSize: 32,
            fontWeight: 500,
            lineHeight: 1.3,
            marginTop: 28,
            maxWidth: 1000,
            display: 'flex',
          }}
        >
          Generează programul lunar al spitalului automat — echitabil și conform legii.
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 36 }}>
          {['Export PDF / Excel', 'Detectare conflicte', 'Distribuție echitabilă'].map(
            (label) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  padding: '10px 20px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white',
                  fontSize: 22,
                  fontWeight: 500,
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 'auto',
          }}
        >
          <div
            style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: 26,
              fontWeight: 500,
            }}
          >
            plangarzi.ro
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '18px 32px',
              borderRadius: 999,
              background: '#5DCAA5',
              color: '#0A3D31',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            Începe Planificarea  →
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: inter500, weight: 500, style: 'normal' },
        { name: 'Inter', data: inter700, weight: 700, style: 'normal' },
        { name: 'Inter', data: inter800, weight: 800, style: 'normal' },
      ],
    },
  );
}
