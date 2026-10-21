
import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT,
  secure: env.EMAIL_PORT === 465,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASSWORD
  }
});

export async function verifyEmailConnection() {
  await transporter.verify();
  console.log("Email SMTP connection verified");
}

export async function sendEmail({ to, subject, text, html }) {
  return transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    text,
    html
  });
}
