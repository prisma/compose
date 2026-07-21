/**
 * The two templates this example sends — declared and rendered
 * consumer-side (ADR-0005; the email module never runs this code, only the
 * rendered `subject`/`html`/`text` it produces).
 */
import { defineTemplates } from '@prisma/composer-prisma-cloud/email';
import { type } from 'arktype';

export const templates = defineTemplates({
  welcome: {
    data: type({ name: 'string' }),
    render: ({ name }) => ({
      subject: `Welcome, ${name}!`,
      html: `<p>Welcome, ${name}!</p>`,
      text: `Welcome, ${name}!`,
    }),
  },
  verification: {
    data: type({ link: 'string' }),
    render: ({ link }) => ({
      subject: 'Verify your email',
      html: `<p><a href="${link}">Verify your email</a></p>`,
      text: `Verify your email: ${link}`,
    }),
  },
});
