import { service, postgres } from "../../index.ts";

export default service({ db: postgres() }, ({ db }) => {
  return { marker: "ARTIFACT_FIXTURE_MARKER", db };
});
