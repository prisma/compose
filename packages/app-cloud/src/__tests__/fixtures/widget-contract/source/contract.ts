import { defineContract } from '@prisma-next/postgres/contract-builder';

export const contract = defineContract(
  { extensionPacks: {} },
  ({ field: f, model: m }) => ({
    models: {
      Widget: m('Widget', {
        fields: {
          id: f.id.uuidv4String(),
          name: f.text(),
        },
      }),
    },
  }),
);
