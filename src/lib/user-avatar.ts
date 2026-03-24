const USER_PLACEHOLDERS = [
  "/images/user/groom_928045.png",
  "/images/user/groom_927999.png",
  "/images/user/bride_928034.png",
  "/images/user/bride_927998.png",
];

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getUserPlaceholderAvatar(seed?: string | null) {
  const value = seed?.trim() || "default-user";
  return USER_PLACEHOLDERS[hashSeed(value) % USER_PLACEHOLDERS.length];
}

