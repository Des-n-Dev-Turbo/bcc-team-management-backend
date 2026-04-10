import { getConfig } from "@/config.ts";

type SendMailParams = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendMail(payload: SendMailParams) {
  const config = getConfig();

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": config.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: config.SMTP_FROM_NAME,
          email: config.SMTP_FROM_EMAIL,
        },
        to: [{ email: payload.to, name: payload.toName }],
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Brevo error: ${err}`);
    }

    console.log(`📧 Email sent to: ${payload.to}`);

    return res.json();
  } catch (error) {
    console.error("❌ Email sending error:", error);
    throw error;
  }
}
