import { describe, expect, it } from "vitest";

import { facilitatorEventSchema } from "@/lib/validation";

const baseEvent = {
  category: "economic" as const,
  severity: "high" as const,
  title: "Demand Collapse",
  narrative: "A severe market correction is disrupting revenue and customer confidence."
};

describe("facilitatorEventSchema", () => {
  it("accepts expanded facilitator effect ranges", () => {
    const parsed = facilitatorEventSchema.parse({
      ...baseEvent,
      effects: {
        cash: -40,
        brand_reputation: 25,
        regulatory_risk: 30
      }
    });

    expect(parsed.effects.cash).toBe(-40);
    expect(parsed.effects.brand_reputation).toBe(25);
    expect(parsed.effects.regulatory_risk).toBe(30);
  });

  it("rejects out-of-range values", () => {
    const result = facilitatorEventSchema.safeParse({
      ...baseEvent,
      effects: {
        cash: 75
      }
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues[0]?.path.join(".")).toBe("effects.cash");
  });
});
