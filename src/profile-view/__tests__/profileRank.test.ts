import { describe, expect, it } from "vitest";
import { readHypixelNetworkRank } from "../profileRank";

describe("readHypixelNetworkRank", () => {
  it("uses a verified staff rank before package-rank fields", () => {
    expect(readHypixelNetworkRank({
      rank: "MODERATOR",
      monthlyPackageRank: "SUPERSTAR",
      newPackageRank: "MVP_PLUS",
      packageRank: "VIP",
    })).toEqual({
      key: "MODERATOR",
      label: "MOD",
      color: "#00aa00",
      plusColor: null,
    });
  });

  it("keeps the monthly base colour separate from the verified MVP++ plus colour", () => {
    expect(readHypixelNetworkRank({
      rank: "NORMAL",
      monthlyPackageRank: "SUPERSTAR",
      newPackageRank: "MVP_PLUS",
      monthlyRankColor: "GOLD",
      rankPlusColor: "YELLOW",
    })).toEqual({
      key: "SUPERSTAR",
      label: "MVP++",
      color: "#ffaa00",
      plusColor: "#ffff55",
    });
  });

  it("uses the established gold fallback for MVP++ pluses when no plus colour is supplied", () => {
    expect(readHypixelNetworkRank({
      monthlyPackageRank: "SUPERSTAR",
      monthlyRankColor: "RED",
    })).toMatchObject({
      key: "SUPERSTAR",
      color: "#ff5555",
      plusColor: "#ffaa00",
    });
  });

  it("uses the verified plus colour only for a plus package rank", () => {
    expect(readHypixelNetworkRank({
      rank: "NORMAL",
      newPackageRank: "MVP_PLUS",
      rankPlusColor: "LIGHT_PURPLE",
    })).toEqual({
      key: "MVP_PLUS",
      label: "MVP+",
      color: "#55ffff",
      plusColor: "#ff55ff",
    });
  });

  it("falls back to the legacy package rank when newer fields are normal", () => {
    expect(readHypixelNetworkRank({ rank: "NONE", newPackageRank: "NONE", packageRank: "VIP" })).toMatchObject({
      key: "VIP",
      label: "VIP",
      color: "#55ff55",
    });
  });

  it("accepts the current YouTuber and Game Master payload spellings safely", () => {
    expect(readHypixelNetworkRank({ rank: "YOUTUBER" })).toMatchObject({
      key: "YOUTUBE",
      label: "YouTube",
      color: "#ff5555",
    });
    expect(readHypixelNetworkRank({ rank: "GAME_MASTER" })).toMatchObject({
      key: "GAME_MASTER",
      label: "GM",
      color: "#00aa00",
    });
  });

  it("keeps missing, private, and unknown payloads neutral", () => {
    expect(readHypixelNetworkRank(null)).toBeNull();
    expect(readHypixelNetworkRank({})).toBeNull();
    expect(readHypixelNetworkRank({ rank: "SECRET", newPackageRank: "UNKNOWN" })).toBeNull();
    expect(readHypixelNetworkRank({ rank: "NORMAL", newPackageRank: "MVP_PLUS", rankPlusColor: "not-a-colour" })).toEqual({
      key: "MVP_PLUS",
      label: "MVP+",
      color: "#55ffff",
      plusColor: null,
    });
  });
});
