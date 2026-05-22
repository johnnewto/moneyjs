import bmwRegressionFixture from "./fixtures/r-regressions/bmw.json";
import gl2PcRegressionFixture from "./fixtures/r-regressions/gl2-pc.json";
import { runNotebookTemplateRegressionFixtures } from "./notebookTemplateRegressionHarness";

runNotebookTemplateRegressionFixtures("default notebook template regressions against R fixtures", [
  bmwRegressionFixture,
  gl2PcRegressionFixture
]);
