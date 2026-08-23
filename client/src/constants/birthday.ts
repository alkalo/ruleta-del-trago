/** Cumpleañero de esta noche. El resto de jugadores sigue igual. */
export const BIRTHDAY_NAME = "Bru";

export function isBirthdayName(name: string | undefined | null): boolean {
  return (name ?? "").trim().toLowerCase() === BIRTHDAY_NAME.toLowerCase();
}

export function hasBirthdayPlayer(names: Array<{ name: string }>): boolean {
  return names.some((p) => isBirthdayName(p.name));
}
