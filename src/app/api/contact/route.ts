import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, subject, message } = body;

  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'PlanGarzi <noreply@plangarzi.ro>',
    to: 'contact@plangarzi.ro',
    replyTo: email.trim(),
    subject: `[Contact Form] ${subject.trim()}`,
    html: `
      <h2>New contact form submission</h2>
      <p><strong>Name:</strong> ${name.trim()}</p>
      <p><strong>Email:</strong> ${email.trim()}</p>
      <p><strong>Subject:</strong> ${subject.trim()}</p>
      <hr />
      <p>${message.trim().replace(/\n/g, '<br />')}</p>
    `,
  });

  if (error) {
    console.error('Failed to send contact email:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
