import { describe, it, expect } from "vitest";
import {
  BUDGET_DESCRIPTIONS,
  FOCUS_ACTION_DESCRIPTIONS,
  RISK_POSTURE_DESCRIPTIONS,
  INTERACTION_DESCRIPTIONS,
} from "../../lib/game-descriptions";

describe("BUDGET_DESCRIPTIONS", () => {
  it("has entries for all five budget categories", () => {
    const keys = ["growth", "people", "resilience", "brand", "compliance"];
    for (const key of keys) {
      expect(BUDGET_DESCRIPTIONS[key as keyof typeof BUDGET_DESCRIPTIONS]).toBeTruthy();
    }
  });
});

describe("FOCUS_ACTION_DESCRIPTIONS", () => {
  it("has entries for all five focus actions", () => {
    const keys = ["expand_market", "improve_efficiency", "invest_people", "risk_mitigation", "brand_campaign"];
    for (const key of keys) {
      expect(FOCUS_ACTION_DESCRIPTIONS[key as keyof typeof FOCUS_ACTION_DESCRIPTIONS]).toBeTruthy();
    }
  });
});

describe("RISK_POSTURE_DESCRIPTIONS", () => {
  it("has entries for all three postures", () => {
    const keys = ["conservative", "balanced", "aggressive"];
    for (const key of keys) {
      expect(RISK_POSTURE_DESCRIPTIONS[key as keyof typeof RISK_POSTURE_DESCRIPTIONS]).toBeTruthy();
    }
  });
});

describe("INTERACTION_DESCRIPTIONS", () => {
  it("has entries for all five interaction types", () => {
    const keys = ["trade_contract", "joint_venture", "price_war", "talent_poach", "reputation_challenge"];
    for (const key of keys) {
      const desc = INTERACTION_DESCRIPTIONS[key as keyof typeof INTERACTION_DESCRIPTIONS];
      expect(desc).toBeTruthy();
      expect(desc.type).toMatch(/^(cooperative|competitive)$/);
      expect(desc.beneficiary).toBeTruthy();
      expect(desc.description).toBeTruthy();
      expect(desc.intensityNote).toBeTruthy();
    }
  });

  it("classifies cooperative and competitive types correctly", () => {
    expect(INTERACTION_DESCRIPTIONS.trade_contract.type).toBe("cooperative");
    expect(INTERACTION_DESCRIPTIONS.joint_venture.type).toBe("cooperative");
    expect(INTERACTION_DESCRIPTIONS.price_war.type).toBe("competitive");
    expect(INTERACTION_DESCRIPTIONS.talent_poach.type).toBe("competitive");
    expect(INTERACTION_DESCRIPTIONS.reputation_challenge.type).toBe("competitive");
  });
});
