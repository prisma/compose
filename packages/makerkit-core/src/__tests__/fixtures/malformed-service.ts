import { service } from "../../index.ts";

// A deliberately malformed service: "db" is declared as an Input but its
// value is not a valid descriptor (missing/invalid `kind`).
export default service({ db: { nope: true } as never }, ({ db }) => ({ db }));
