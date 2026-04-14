import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../supabase/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { month, year } = await request.json();
  if (typeof month !== 'number' || typeof year !== 'number') {
    return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
  }

  // Fetch doctors with emails
  const { data: doctors, error: doctorsError } = await supabase
    .from('doctors')
    .select('id, name, email')
    .not('email', 'is', null);

  if (doctorsError) {
    return NextResponse.json({ error: 'Failed to fetch doctors' }, { status: 500 });
  }

  const doctorsWithEmail = (doctors ?? []).filter((d) => d.email?.trim());

  if (doctorsWithEmail.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, errors: [] });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const monthNames = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
  ];
  const monthName = monthNames[month] ?? '';

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const doctor of doctorsWithEmail) {
    try {
      // Upsert token — reuse existing token for same doctor/month/year, refresh expiry
      const { data: tokenRow, error: tokenError } = await supabase
        .from('schedule_share_tokens')
        .upsert(
          {
            user_id: user.id,
            doctor_id: doctor.id,
            month,
            year,
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'user_id,doctor_id,month,year' }
        )
        .select('token')
        .single();

      if (tokenError || !tokenRow) {
        errors.push(`${doctor.name}: token creation failed`);
        continue;
      }

      const viewUrl = `${siteUrl}/schedule/view/${tokenRow.token}`;

      const { error: emailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'PlanGarzi <noreply@plangarzi.com>',
        to: doctor.email!,
        subject: `Programul turelor — ${monthName} ${year}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Programul turelor</h2>
            <p>Bună, <strong>${doctor.name}</strong>,</p>
            <p>Programul turelor pentru <strong>${monthName} ${year}</strong> este disponibil.</p>
            <p style="margin: 24px 0;">
              <a href="${viewUrl}"
                 style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Vezi programul
              </a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              Link-ul este valabil 90 de zile. Dacă a expirat, solicită un link nou de la administrator.
            </p>
          </div>
        `,
      });

      if (emailError) {
        errors.push(`${doctor.name}: ${emailError.message}`);
      } else {
        sent++;
      }
    } catch (err) {
      errors.push(`${doctor.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  const totalDoctors = doctors?.length ?? 0;
  skipped = totalDoctors - doctorsWithEmail.length;

  return NextResponse.json({ sent, skipped, errors });
}
