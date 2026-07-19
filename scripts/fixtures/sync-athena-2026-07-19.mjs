// Compact fixture distilled from a real /api/sync response (athena profile,
// 2026-07-19). Each entry: [vtid suffix after "vtid_backpack_coldtrophy_",
// quest_state]. Account identifiers and item GUIDs stripped.
//
// Expected parse (see test-collection.mjs): 47 owned variants of 89 total;
// The Burnt Peanut complete (1/1); Grim Reaper 0 owned with all 4 pending;
// Air and Seven entirely unseen.

const REDEEM = [
  ["water", "Claimed"], ["water_gummy", "Claimed"], ["water_galaxy", "Active"],
  ["water_gold", "Claimed"], ["water_holofoil", "Claimed"], ["water_gem", "Active"],

  ["earth", "Claimed"], ["earth_gold", "Claimed"], ["earth_gummy", "Claimed"],
  ["earth_galaxy", "Claimed"], ["earth_gem", "Active"],

  ["fire", "Claimed"], ["fire_galaxy", "Claimed"], ["fire_gold", "Claimed"],
  ["fire_gummy", "Claimed"], ["fire_holofoil", "Claimed"],

  ["duck", "Claimed"], ["duck_gummy", "Claimed"], ["duck_gold", "Claimed"],
  ["duck_galaxy", "Active"], ["duck_gem", "Active"],

  ["ghost", "Claimed"], ["ghost_gummy", "Claimed"], ["ghost_gold", "Claimed"],
  ["ghost_galaxy", "Active"], ["ghost_holofoil", "Claimed"],

  ["reddemon", "Claimed"], ["reddemon_gummy", "Claimed"], ["reddemon_gold", "Claimed"],
  ["reddemon_galaxy", "Claimed"], ["reddemon_gem", "Active"],

  ["king", "Claimed"], ["king_gold", "Claimed"], ["king_gummy", "Active"],
  ["king_galaxy", "Active"], ["king_holofoil", "Claimed"],

  ["sleepy", "Claimed"], ["sleepy_gold", "Claimed"], ["sleepy_gummy", "Claimed"],
  ["sleepy_galaxy", "Active"],

  ["punk", "Claimed"], ["punk_gold", "Active"], ["punk_gummy", "Active"],
  ["punk_galaxy", "Active"],

  ["crispynut", "Claimed"],

  ["zeropoint", "Claimed"], ["zeropoint_gummy", "Claimed"], ["zeropoint_gold", "Active"],
  ["zeropoint_galaxy", "Active"], ["zeropoint_gem", "Active"],

  ["fishy", "Claimed"], ["fishy_gummy", "Claimed"], ["fishy_gold", "Claimed"],
  ["fishy_galaxy", "Claimed"],

  ["soccer", "Claimed"], ["soccer_gummy", "Claimed"], ["soccer_gold", "Claimed"],
  ["soccer_galaxy", "Active"], ["soccer_holofoil", "Active"],

  ["drifter", "Claimed"], ["drifter_gummy", "Claimed"], ["drifter_gold", "Claimed"],
  ["drifter_galaxy", "Active"], ["drifter_gem", "Active"],

  ["boss", "Claimed"], ["boss_gold", "Claimed"], ["boss_galaxy", "Claimed"],
  ["boss_gummy", "Active"],

  ["grimreaper", "Active"], ["grimreaper_gold", "Active"],
  ["grimreaper_gummy", "Active"], ["grimreaper_galaxy", "Active"],
];

// 47 from redeem quests + Seven Gold (owned vtid token) + Seven Base
// (backpack style tag) = 49. The Fire Base backpack tag overlaps a
// quest-claimed variant and must not double count.
export const EXPECTED = { owned: 49, pending: 25 };

export function fixtureItems() {
  const items = REDEEM.map(([suffix, state], i) => ({
    itemId: `fixture-${i}`,
    templateId: `Quest:quest_s41_spritemastery_redeem_fixture_${suffix}`,
    quantity: 1,
    attributes: {
      quest_state: state,
      premium_rewards: {
        rewards: [
          {
            templateId: `CosmeticVariantToken:vtid_backpack_coldtrophy_${suffix}`,
            quantity: 1,
          },
        ],
      },
    },
    profileId: "athena",
  }));

  // Season plumbing that must be ignored silently.
  items.push(
    {
      itemId: "noise-1",
      templateId: "Quest:quest_s41_spritemastery_p01_q01",
      quantity: 1,
      attributes: {
        quest_state: "Claimed",
        premium_rewards: {
          rewards: [
            { templateId: "Token:athena_s41_spritemastery_token_q01", quantity: 1 },
          ],
        },
      },
      profileId: "athena",
    },
    {
      itemId: "noise-2",
      templateId: "Token:athena_s41_spritemastery_token_q01",
      quantity: 1,
      attributes: { level: 1 },
      profileId: "athena",
    },
    {
      itemId: "noise-3",
      templateId: "ChallengeBundle:questbundle_s41_bpquests_spritemastery_01",
      quantity: 1,
      attributes: {},
      profileId: "athena",
    },
    {
      itemId: "noise-4",
      templateId: "ChallengeBundleSchedule:s41_bpquests_spritemastery_schedule_p01",
      quantity: 1,
      attributes: {},
      profileId: "athena",
    },
    {
      itemId: "noise-5",
      templateId: "Quest:quest_daily_s41_spriteextvendingpurchasegate",
      quantity: 1,
      attributes: { quest_state: "Claimed" },
      profileId: "athena",
    }
  );

  // Mastery progression: chain q01 = Water (seeded). noise-1 above is the
  // Claimed mastery quest for step "", these tokens add steps a/c/e → L4.
  for (const step of ["a", "c", "e"]) {
    items.push({
      itemId: `mastery-water-${step}`,
      templateId: `Token:athena_s41_spritemastery_token_q01${step}`,
      quantity: 1,
      attributes: { level: 1 },
      profileId: "athena",
    });
  }
  // Chain q03 = Fire: 4 tokens + 1 Claimed mastery quest = 5 steps → crown.
  for (const step of ["", "a", "b", "c"]) {
    items.push({
      itemId: `mastery-fire-${step || "base"}`,
      templateId: `Token:athena_s41_spritemastery_token_q03${step}`,
      quantity: 1,
      attributes: { level: 1 },
      profileId: "athena",
    });
  }
  items.push({
    itemId: "mastery-fire-quest",
    templateId: "Quest:quest_s41_spritemastery_p02_q03d",
    quantity: 1,
    attributes: {
      quest_state: "Claimed",
      premium_rewards: {
        rewards: [
          { templateId: "Token:athena_s41_spritemastery_token_q03d", quantity: 1 },
        ],
      },
    },
    profileId: "athena",
  });
  // Seeded-by-elimination chains: q16 = Air (L1), q17 = Seven (L2) —
  // mirrors the real account, where these chains have progress but no
  // redeem quests exist yet.
  for (const t of ["q16", "q17", "q17c"]) {
    items.push({
      itemId: `mastery-${t}`,
      templateId: `Token:athena_s41_spritemastery_token_${t}`,
      quantity: 1,
      attributes: { level: 1 },
      profileId: "athena",
    });
  }
  // Chain q22 maps to nothing at all → must surface as an unknown chain.
  items.push({
    itemId: "mastery-q22",
    templateId: "Token:athena_s41_spritemastery_token_q22",
    quantity: 1,
    attributes: { level: 1 },
    profileId: "athena",
  });

  // Chain q19 is NOT in the seed — this redeem quest teaches the mapping
  // (reward names Seven), and its two tokens then count as Seven mastery.
  items.push({
    itemId: "redeem-seven",
    templateId: "Quest:quest_s41_spritemastery_redeem_p03_q19",
    quantity: 1,
    attributes: {
      quest_state: "Active",
      premium_rewards: {
        rewards: [
          {
            templateId: "CosmeticVariantToken:vtid_backpack_coldtrophy_seven",
            quantity: 1,
          },
        ],
      },
    },
    profileId: "athena",
  });
  for (const step of ["", "a"]) {
    items.push({
      itemId: `mastery-seven-${step || "base"}`,
      templateId: `Token:athena_s41_spritemastery_token_q19${step}`,
      quantity: 1,
      attributes: { level: 1 },
      profileId: "athena",
    });
  }

  // Directly-owned variant token (granted outside the quest flow — vending,
  // later phases). This is how sprites like Seven appear when no redeem
  // quest exists yet; the /sprite/i server filter used to drop these.
  items.push({
    itemId: "token-owned-1",
    templateId: "CosmeticVariantToken:vtid_backpack_coldtrophy_seven_gold",
    quantity: 1,
    attributes: { level: 1 },
    profileId: "athena",
  });

  // The Sprite Mastery Pod backpack with its owned style tags — ground truth
  // in a second encoding. Mat0 = empty pod (skip), Mesh.Mat13 = Fire Base
  // (already owned via quest — no double count), Stage26 = Seven Base.
  items.push({
    itemId: "backpack-1",
    templateId: "AthenaBackpack:bid_a1b2_coldtrophy",
    quantity: 1,
    attributes: {
      variants: [{ channel: "Mesh", active: "Mat13", owned: ["Mat0", "Mesh.Mat13", "Stage26"] }],
    },
    profileId: "athena",
  });

  // Unknown future slug — must land in `unmapped`, not be dropped.
  items.push({
    itemId: "future-1",
    templateId: "Quest:quest_s41_spritemastery_redeem_fixture_wanderer",
    quantity: 1,
    attributes: {
      quest_state: "Active",
      premium_rewards: {
        rewards: [
          {
            templateId:
              "CosmeticVariantToken:vtid_backpack_coldtrophy_wanderer_gold",
            quantity: 1,
          },
        ],
      },
    },
    profileId: "athena",
  });

  return items;
}
