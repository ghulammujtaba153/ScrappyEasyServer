

export const sendEmail = async (to, subject, text) => {
    try {
        await nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    } catch (error) {
        console.log(error);
    }
};