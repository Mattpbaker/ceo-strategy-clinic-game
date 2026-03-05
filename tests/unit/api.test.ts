import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseBody } from "@/lib/api";

describe("parseBody", () => {
  it("formats zod errors into readable path-based messages", async () => {
    const schema = z.object({
      effects: z.object({
        cash: z.number().max(20)
      })
    });

    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        effects: {
          cash: 35
        }
      })
    });

    await expect(parseBody(request, schema)).rejects.toThrow(
      "effects.cash: Number must be less than or equal to 20"
    );
  });
});
