/** Loads the real apps-script/Code.gs in a vm with the repo's test harness mocks. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadCodeGs(): any {
  const p = require.resolve("../apps-script/test/harness.js");
  delete require.cache[p];
  return require(p);
}
