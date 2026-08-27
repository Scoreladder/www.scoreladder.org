/*
 * =========================================================
 * SCORELADDER MINERAL RANKS
 * =========================================================
 *
 * Ranks are derived entirely from Elo.
 *
 * IMPORTANT:
 * - Ranks are NOT stored in D1.
 * - RW and Math calculate ranks independently.
 * - Matchmaking does NOT use these ranks.
 * - Matchmaking Elo windows remain a separate system.
 *
 * Rank ranges:
 *
 * Bronze    < 600
 * Iron      600 - 799
 * Silver    800 - 999
 * Gold      1000 - 1199
 * Platinum  1200 - 1399
 * Sapphire  1400 - 1599
 * Emerald   1600 - 1799
 * Amethyst  1800 - 1999
 * Diamond   2000 - 2199
 * Painite   2200+
 * =========================================================
 */

export const MINERAL_RANKS = [
  {
    name: "Bronze",
    minElo: -Infinity,
    maxElo: 599,
    className: "rank-bronze"
  },
  {
    name: "Iron",
    minElo: 600,
    maxElo: 799,
    className: "rank-iron"
  },
  {
    name: "Silver",
    minElo: 800,
    maxElo: 999,
    className: "rank-silver"
  },
  {
    name: "Gold",
    minElo: 1000,
    maxElo: 1199,
    className: "rank-gold"
  },
  {
    name: "Platinum",
    minElo: 1200,
    maxElo: 1399,
    className: "rank-platinum"
  },
  {
    name: "Sapphire",
    minElo: 1400,
    maxElo: 1599,
    className: "rank-sapphire"
  },
  {
    name: "Emerald",
    minElo: 1600,
    maxElo: 1799,
    className: "rank-emerald"
  },
  {
    name: "Amethyst",
    minElo: 1800,
    maxElo: 1999,
    className: "rank-amethyst"
  },
  {
    name: "Diamond",
    minElo: 2000,
    maxElo: 2199,
    className: "rank-diamond"
  },
  {
    name: "Painite",
    minElo: 2200,
    maxElo: Infinity,
    className: "rank-painite"
  }
];

/*
 * =========================================================
 * GET MINERAL RANK
 * =========================================================
 *
 * Returns the complete rank object for an Elo value.
 *
 * Example:
 *
 * getMineralRank(1850)
 *
 * returns:
 *
 * {
 *   name: "Amethyst",
 *   minElo: 1800,
 *   maxElo: 1999,
 *   className: "rank-amethyst"
 * }
 * =========================================================
 */

export function getMineralRank(elo) {
  const numericElo = Number(elo);

  if (!Number.isFinite(numericElo)) {
    return null;
  }

  return (
    MINERAL_RANKS.find(
      rank =>
        numericElo >= rank.minElo &&
        numericElo <= rank.maxElo
    ) || null
  );
}

/*
 * =========================================================
 * GET MINERAL RANK NAME
 * =========================================================
 *
 * Convenience function when only the rank name is needed.
 *
 * Example:
 *
 * getMineralRankName(1850)
 * -> "Amethyst"
 * =========================================================
 */

export function getMineralRankName(elo) {
  const rank = getMineralRank(elo);

  return rank
    ? rank.name
    : null;
}

/*
 * =========================================================
 * GET MINERAL RANK CSS CLASS
 * =========================================================
 *
 * Convenience function for UI elements.
 *
 * Example:
 *
 * getMineralRankClass(1850)
 * -> "rank-amethyst"
 *
 * The actual colors can be added later in CSS.
 * =========================================================
 */

export function getMineralRankClass(elo) {
  const rank = getMineralRank(elo);

  return rank
    ? rank.className
    : null;
}

/*
 * =========================================================
 * FORMAT RANK FOR DISPLAY
 * =========================================================
 *
 * Example:
 *
 * formatMineralRank(1850)
 * -> "Rank: Amethyst"
 * =========================================================
 */

export function formatMineralRank(elo) {
  const rank = getMineralRank(elo);

  return rank
    ? `Rank: ${rank.name}`
    : "Rank: —";
}