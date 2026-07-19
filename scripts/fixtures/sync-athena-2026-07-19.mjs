// Purpose-built fixture for the three-state parser (mastered / found /
// missing). Exercises every signal path; expectations in test-collection.mjs.
//
// Expected: mastered = { fire: {Normal, Gold} } (2, from backbling tags).
//           found = { water:{Normal,Gummy}, ghost:{Normal}, seven:{Normal,Gummy} } (5).
//           Fire Base has both a backbling tag and a mastery token → MASTERED
//           wins, never double-listed in found.

export const EXPECTED = { mastered: 2, found: 5 };

export function fixtureItems() {
  const items = [];
  const push = (o) => items.push({ profileId: "athena", quantity: 1, ...o });

  // Backbling owned tags → MASTERED. Mat0 = empty pod (skip), Mat13 = Fire
  // Base, Mat14 = Fire Gold. (Namespaced "Mesh.Mat13" must also resolve.)
  push({
    itemId: "backpack",
    templateId: "AthenaBackpack:bid_x_coldtrophy",
    attributes: {
      variants: [{ channel: "Mesh", active: "Mat13", owned: ["Mat0", "Mesh.Mat13", "Mat14"] }],
    },
  });

  // Claimed redeem → FOUND (Water Base). Active redeem → nothing (Water Gold).
  const redeem = (id, suffix, state) =>
    push({
      itemId: id,
      templateId: `Quest:quest_s41_spritemastery_${id}`,
      attributes: {
        quest_state: state,
        premium_rewards: {
          rewards: [{ templateId: `CosmeticVariantToken:vtid_backpack_coldtrophy_${suffix}` }],
        },
      },
    });
  redeem("redeem_p01_q01", "water", "Claimed");
  redeem("redeem_p01_q01c", "water_gold", "Active");

  // Possessed variant token → FOUND (Ghost Base).
  push({
    itemId: "vtid-ghost",
    templateId: "CosmeticVariantToken:vtid_backpack_coldtrophy_ghost",
    attributes: { level: 1 },
  });

  // Mastery tokens on seeded chain q01 = Water: q01 (Base, dup of the claimed
  // redeem — no double count), q01a (Gummy) → FOUND.
  const token = (q) =>
    push({
      itemId: `t-${q}`,
      templateId: `Token:athena_s41_spritemastery_token_${q}`,
      attributes: { level: 1 },
    });
  token("q01");
  token("q01a");

  // Fire Base mastery token, but Fire Base is MASTERED (backbling) → superseded.
  token("q03");

  // Unknown chain q22 → unknownChains, never invented into a sprite.
  token("q22");

  // Unseeded chain q19: a redeem names it Seven, so its tokens resolve —
  // q19 → Seven Base, q19a → Seven Gummy (global letter table).
  redeem("redeem_p03_q19", "seven", "Active");
  token("q19");
  token("q19a");

  // Season plumbing — all ignored.
  push({
    itemId: "noise-mastery-quest",
    templateId: "Quest:quest_s41_spritemastery_p01_q01",
    attributes: {
      quest_state: "Claimed",
      premium_rewards: {
        rewards: [{ templateId: "Token:athena_s41_spritemastery_token_q01" }],
      },
    },
  });
  push({ itemId: "noise-bundle", templateId: "ChallengeBundle:questbundle_x", attributes: {} });
  push({
    itemId: "noise-daily",
    templateId: "Quest:quest_daily_s41_spriteextvendingpurchasegate",
    attributes: { quest_state: "Claimed" },
  });

  // Unknown slug in a redeem reward → unmapped, not dropped.
  push({
    itemId: "future",
    templateId: "Quest:quest_s41_spritemastery_redeem_p09_q01",
    attributes: {
      quest_state: "Claimed",
      premium_rewards: {
        rewards: [{ templateId: "CosmeticVariantToken:vtid_backpack_coldtrophy_wanderer_gold" }],
      },
    },
  });

  return items;
}
