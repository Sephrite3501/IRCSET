import nodemailer from 'nodemailer';


const transporter = nodemailer.createTransport({
host: process.env.MAIL_HOST,
port: Number(process.env.MAIL_PORT || 465),
secure: String(process.env.MAIL_SECURE || 'true') === 'true',
auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
});


export async function sendMail({ to, subject, html }) {
return transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
}