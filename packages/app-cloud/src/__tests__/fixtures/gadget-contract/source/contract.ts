import { defineContract } from '@prisma-next/postgres/contract-builder';

export const contract = defineContract(
  { extensionPacks: {} },
  ({ field: f, model: m }) => ({
    models: {
      Gadget: m('Gadget', {
        fields: {
          id: f.id.uuidv4String(),
          label: f.text(),
        },
      }),
    },
  }),
);
