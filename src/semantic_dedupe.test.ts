import assert from "node:assert/strict";
import { classifyMatch } from "./semantic_dedupe.ts";

const result = classifyMatch({ id: "asset-old", score: 0.93, metadata: { text: "blue crystal sword" } });
assert.equal(result, "review");
assert.equal(classifyMatch({ id: "asset-other", score: 0.41 }), "accept");
console.log("semantic decision test passed: a near duplicate enters review");
