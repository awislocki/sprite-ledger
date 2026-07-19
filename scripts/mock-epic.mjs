// Mock Epic server — lets you test the complete app flow locally without
// touching real Epic accounts. Start with `npm run dev:mock`.
//
// Simulates: auth-code exchange (single-use codes), device auth mint/verify/
// revoke, and QueryProfile with realistic sprite items — including one
// deliberately unmapped templateId so the "New from Epic" path is exercised.

import http from "http";
import crypto from "crypto";

const PORT = Number(process.env.MOCK_PORT || 9999);
export const TEST_CODE = "deadbeefdeadbeefdeadbeefdeadbeef";

const usedCodes = new Set();
const deviceAuths = new Map(); // deviceId -> { accountId, secret }
const deviceCodes = new Map(); // device_code -> polls seen (approves on 2nd)
const ACCOUNT = { id: "mock-account-adam", displayName: "TestGuardian" };
const MOCK_USER_CODE = "WXYZ-1234";

// Mirrors the real profile shape: sprite ownership lives in
// "spritemastery_redeem" quests whose premium reward is a
// CosmeticVariantToken:vtid_backpack_coldtrophy_<slug>[_<style>].
// Claimed = owned, Active = not yet. Includes alias slugs (sleepy→Dream,
// drifter→Aura), plumbing that must be ignored, and one unknown slug so the
// "New from Epic" path stays exercised.
const redeemQuest = (suffix, state) => ({
  templateId: `Quest:quest_s41_spritemastery_redeem_mock_${suffix}`,
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
});

const SPRITE_ITEMS = {
  "item-1": redeemQuest("fire_gold", "Claimed"),
  "item-2": redeemQuest("fire", "Claimed"),
  "item-3": redeemQuest("fishy", "Claimed"),
  "item-4": redeemQuest("grimreaper_galaxy", "Active"),
  "item-5": redeemQuest("water", "Claimed"),
  "item-6": redeemQuest("water_gem", "Active"),
  "item-7": redeemQuest("sleepy_gold", "Claimed"), // alias → Dream
  "item-8": redeemQuest("drifter", "Claimed"), // alias → Aura
  "item-8b": redeemQuest("crispynut", "Claimed"), // 1/1 → mastered crown
  "item-9": redeemQuest("wanderer_gold", "Claimed"), // unmapped on purpose
  "item-10": {
    templateId: "Token:athena_s41_spritemastery_token_q01",
    quantity: 1,
    attributes: { level: 1 },
  },
  // Chain-numbered redeem quests teach step→variant (q03 = Fire, "" = Base,
  // c = Gold); the level-5 base token then crowns the Fire Base tile.
  "chain-1": {
    templateId: "Quest:quest_s41_spritemastery_redeem_p01_q03",
    quantity: 1,
    attributes: {
      quest_state: "Claimed",
      premium_rewards: {
        rewards: [
          { templateId: "CosmeticVariantToken:vtid_backpack_coldtrophy_fire", quantity: 1 },
        ],
      },
    },
  },
  "chain-2": {
    templateId: "Quest:quest_s41_spritemastery_redeem_p01_q03c",
    quantity: 1,
    attributes: {
      quest_state: "Claimed",
      premium_rewards: {
        rewards: [
          { templateId: "CosmeticVariantToken:vtid_backpack_coldtrophy_fire_gold", quantity: 1 },
        ],
      },
    },
  },
  "token-fire-base": {
    templateId: "Token:athena_s41_spritemastery_token_q03",
    quantity: 1,
    attributes: { level: 5 },
  },
  "token-fire-gold": {
    templateId: "Token:athena_s41_spritemastery_token_q03c",
    quantity: 1,
    attributes: { level: 2 },
  },
  // Seven caught in-game (two creatures) with zero pod styles unlocked,
  // plus an orphan chain (q22) for the "unreleased sprite" section.
  ...Object.fromEntries(
    ["q17", "q17c", "q22"].map((t) => [
      `token-${t}`,
      {
        templateId: `Token:athena_s41_spritemastery_token_${t}`,
        quantity: 1,
        attributes: { level: 1 },
      },
    ])
  ),
  // The shared Sprite Mastery Pod with its owned styles — the "backbling"
  // list the recon reads.
  "backpack-pod": {
    templateId: "AthenaBackpack:backpack_coldtrophy",
    quantity: 1,
    attributes: {
      variants: [{ channel: "Mesh", active: "Mat13", owned: ["Mat13", "Mat14", "Stage6"] }],
    },
  },
  // A COLLAB sprite that awards its OWN backbling (no ColdTrophy variant) —
  // this is what the widened recon must surface so we can find Batman/Vini.
  "backpack-collab": {
    templateId: "AthenaBackpack:backpack_batmansprite",
    quantity: 1,
    attributes: {
      variants: [{ channel: "Mesh", active: "Mat1", owned: ["Mat1", "Mat2"] }],
    },
  },
};

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // --- OAuth token ---
  if (req.method === "POST" && path === "/account/api/oauth/token") {
    const params = new URLSearchParams(await readBody(req));
    const grant = params.get("grant_type");

    if (grant === "authorization_code") {
      const code = params.get("code");
      if (code !== TEST_CODE || usedCodes.has(code)) {
        return json(res, 400, {
          errorCode: "errors.com.epicgames.account.oauth.authorization_code_not_found",
          errorMessage: "Sorry the authorization code you supplied was not found. It is possible that it was no longer valid",
        });
      }
      usedCodes.add(code);
      return json(res, 200, {
        access_token: "mock-token-" + crypto.randomBytes(8).toString("hex"),
        account_id: ACCOUNT.id,
        displayName: ACCOUNT.displayName,
        expires_in: 7200,
      });
    }

    if (grant === "client_credentials") {
      return json(res, 200, {
        access_token: "mock-cc-" + crypto.randomBytes(8).toString("hex"),
        expires_in: 14400,
      });
    }

    // Device-code flow: pending on the first poll, approved on the second,
    // so the client's polling loop is exercised end to end.
    if (grant === "device_code") {
      const dc = params.get("device_code");
      const seen = (deviceCodes.get(dc) || 0) + 1;
      deviceCodes.set(dc, seen);
      if (seen < 2) {
        return json(res, 400, {
          errorCode: "errors.com.epicgames.account.oauth.authorization_pending",
          errorMessage: "Authorization pending.",
        });
      }
      return json(res, 200, {
        access_token: "mock-token-" + crypto.randomBytes(8).toString("hex"),
        account_id: ACCOUNT.id,
        displayName: ACCOUNT.displayName,
        expires_in: 7200,
      });
    }

    if (grant === "exchange_code") {
      // Any exchange code from our own /exchange endpoint is accepted.
      return json(res, 200, {
        access_token: "mock-token-" + crypto.randomBytes(8).toString("hex"),
        account_id: ACCOUNT.id,
        displayName: ACCOUNT.displayName,
        expires_in: 7200,
      });
    }

    if (grant === "device_auth") {
      const da = deviceAuths.get(params.get("device_id"));
      if (
        !da ||
        da.accountId !== params.get("account_id") ||
        da.secret !== params.get("secret")
      ) {
        return json(res, 400, {
          errorCode: "errors.com.epicgames.account.invalid_grant",
          errorMessage: "Invalid device auth details supplied.",
        });
      }
      return json(res, 200, {
        access_token: "mock-token-" + crypto.randomBytes(8).toString("hex"),
        account_id: da.accountId,
        displayName: ACCOUNT.displayName,
        expires_in: 7200,
      });
    }

    return json(res, 400, { errorCode: "unsupported_grant", errorMessage: "Unsupported grant." });
  }

  // --- Device authorization (start of the device-code flow) ---
  if (req.method === "POST" && path === "/account/api/oauth/deviceAuthorization") {
    const dc = "mock-dc-" + crypto.randomBytes(8).toString("hex");
    deviceCodes.set(dc, 0);
    return json(res, 200, {
      user_code: MOCK_USER_CODE,
      device_code: dc,
      verification_uri: `http://127.0.0.1:${PORT}/mock-activate`,
      verification_uri_complete: `http://127.0.0.1:${PORT}/mock-activate?userCode=${MOCK_USER_CODE}`,
      prompt: "login",
      expires_in: 600,
      interval: 2,
    });
  }
  if (req.method === "GET" && path === "/mock-activate") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(
      "<h2>Mock Epic</h2><p>Approved automatically — return to the app tab; it'll sign you in.</p>"
    );
  }

  // --- Exchange code (client handoff: switch token → android token) ---
  if (req.method === "GET" && path === "/account/api/oauth/exchange") {
    return json(res, 200, {
      expiresInSeconds: 300,
      code: "mock-exchange-" + crypto.randomBytes(8).toString("hex"),
      creatingClientId: "mock",
    });
  }

  // --- Device auth create / delete ---
  const daCreate = path.match(/^\/account\/api\/public\/account\/([^/]+)\/deviceAuth$/);
  if (req.method === "POST" && daCreate) {
    const deviceId = crypto.randomBytes(16).toString("hex");
    const secret = crypto.randomBytes(16).toString("hex");
    deviceAuths.set(deviceId, { accountId: daCreate[1], secret });
    return json(res, 200, { deviceId, accountId: daCreate[1], secret });
  }
  const daDelete = path.match(/^\/account\/api\/public\/account\/[^/]+\/deviceAuth\/([^/]+)$/);
  if (req.method === "DELETE" && daDelete) {
    deviceAuths.delete(daDelete[1]);
    res.writeHead(204);
    return res.end();
  }

  // --- QueryProfile ---
  const qp = path.match(/^\/fortnite\/api\/game\/v2\/profile\/[^/]+\/client\/QueryProfile$/);
  if (req.method === "POST" && qp) {
    const profileId = url.searchParams.get("profileId");
    if (profileId === "athena") {
      return json(res, 200, {
        profileChanges: [
          {
            profile: {
              items: SPRITE_ITEMS,
              stats: { attributes: { sprite_dust_balance: 1250, past_seasons: [] } },
            },
          },
        ],
      });
    }
    // collections: simulate "profile not found" to exercise profileErrors
    return json(res, 404, {
      errorCode: "errors.com.epicgames.modules.profiles.profile_not_found",
      errorMessage: `Profile ${profileId} not found`,
    });
  }

  json(res, 404, { errorCode: "not_found", errorMessage: `No mock for ${req.method} ${path}` });
});

server.listen(PORT, () => {
  console.log(`\nMock Epic listening on http://127.0.0.1:${PORT}`);
  console.log(`Test sign-in code (single-use per run): ${TEST_CODE}\n`);
});
