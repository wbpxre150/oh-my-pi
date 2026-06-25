import { describe, expect, it } from "bun:test";
import { MODEL_ROLE_IDS, MODEL_ROLES } from "@oh-my-pi/pi-coding-agent/config/model-registry";

describe("debug model role registration", () => {
  it("includes debug in MODEL_ROLE_IDS", () => {
    expect(MODEL_ROLE_IDS).toContain("debug");
  });

  it("registers debug in MODEL_ROLES with tag, name, and color", () => {
    expect(MODEL_ROLES.debug).toEqual({
      tag: "DEBUG",
      name: "Debugger",
      color: "muted",
    });
  });

  it("places debug adjacent to plan for chooser grouping", () => {
    const planIndex = MODEL_ROLE_IDS.indexOf("plan");
    const debugIndex = MODEL_ROLE_IDS.indexOf("debug");
    expect(debugIndex).toBe(planIndex + 1);
  });
});
