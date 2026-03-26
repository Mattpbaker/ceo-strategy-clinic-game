import { describe, it, expect } from "vitest";
import { EVENT_PRESETS, EventPreset } from "@/lib/event-presets";

describe("EVENT_PRESETS", () => {
  it("contains exactly 18 presets", () => {
    expect(EVENT_PRESETS).toHaveLength(18);
  });

  it("each preset has all required fields", () => {
    for (const preset of EVENT_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(["economic", "social", "political"]).toContain(preset.category);
      expect(["low", "medium", "high"]).toContain(preset.severity);
      expect(preset.title).toBeTruthy();
      expect(preset.narrative).toBeTruthy();
      expect(preset.effects).toBeTruthy();
    }
  });

  it("each preset effects object has all seven metric keys", () => {
    const metricKeys = ["cash", "revenue_growth", "market_share", "talent_morale", "operational_resilience", "brand_reputation", "regulatory_risk"];
    for (const preset of EVENT_PRESETS) {
      for (const key of metricKeys) {
        expect(typeof preset.effects[key as keyof EventPreset["effects"]]).toBe("number");
      }
    }
  });

  it("all preset IDs are unique", () => {
    const ids = EVENT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has expected distribution across categories", () => {
    const byCategory = { economic: 0, social: 0, political: 0 };
    for (const p of EVENT_PRESETS) byCategory[p.category]++;
    expect(byCategory.economic).toBe(6);
    expect(byCategory.social).toBe(5);
    expect(byCategory.political).toBe(7);
  });
});
