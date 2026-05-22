import gl6DisRegressionFixture from "./fixtures/r-regressions/gl6-dis.json";
import gl7InsoutRegressionFixture from "./fixtures/r-regressions/gl7-insout.json";
import gl8GrowthRegressionFixture from "./fixtures/r-regressions/gl8-growth.json";
import { runNotebookTemplateRegressionFixtures } from "./notebookTemplateRegressionHarness";

runNotebookTemplateRegressionFixtures("extended notebook template regressions against R fixtures", [
  gl6DisRegressionFixture,
  gl7InsoutRegressionFixture,
  gl8GrowthRegressionFixture
]);
