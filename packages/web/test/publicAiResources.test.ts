import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { notebookFromYaml } from "../src/notebook/document";
import { validateNotebookModels } from "../src/notebook/notebookSourceWorkflow";
import { validateNotebookDocument } from "../src/notebook/validation";

const publicRoot = path.resolve(__dirname, "../public");
const yamlExampleIds = ["starter", "sim", "bmw", "gl6-dis-rentier-v2"] as const;

describe("public AI authoring resources", () => {
  it("advertises YAML as the preferred notebook authoring format", () => {
    const discovery = JSON.parse(fs.readFileSync(path.join(publicRoot, ".well-known/sfcr.json"), "utf8"));
    const guideManifest = JSON.parse(
      fs.readFileSync(path.join(publicRoot, ".well-known/sfcr-notebook-guide.json"), "utf8")
    );

    expect(discovery.resources.notebooks.prompt).toBe("../ai-prompts/create-sfcr-notebook-yaml.md");
    expect(discovery.capabilities.preferredFormat).toBe("sfcr-notebook-yaml");
    expect(discovery.capabilities.supportedFormats).toEqual(["sfcr-notebook-yaml", "sfcr-notebook-json"]);
    expect(guideManifest.promptUrl).toBe("../ai-prompts/create-sfcr-notebook-yaml.md");
    expect(guideManifest.preferredNotebookFormat).toBe("sfcr-notebook-yaml");
    expect(guideManifest.supportedFormats).toEqual(["sfcr-notebook-yaml", "sfcr-notebook-json"]);
  });

  it("links the YAML prompt and public YAML examples from the sitemap", () => {
    const sitemap = fs.readFileSync(path.join(publicRoot, "sitemap.xml"), "utf8");

    expect(sitemap).toContain("/ai-prompts/create-sfcr-notebook-yaml.md");
    for (const exampleId of yamlExampleIds) {
      expect(sitemap).toContain(`/notebook-examples/${exampleId}.example.notebook.yaml`);
    }
  });

  it("publishes schema-valid YAML notebook examples", () => {
    for (const exampleId of yamlExampleIds) {
      const source = fs.readFileSync(
        path.join(publicRoot, "notebook-examples", `${exampleId}.example.notebook.yaml`),
        "utf8"
      );
      const document = notebookFromYaml(source);

      expect(validateNotebookDocument(document), exampleId).toEqual([]);
      expect(validateNotebookModels(document).issueCount, exampleId).toBe(0);
    }
  });
});
