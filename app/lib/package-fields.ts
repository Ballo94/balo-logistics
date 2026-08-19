export const PACKAGE_TYPE_OPTIONS = [
  "Container", "Pallet", "Carton", "Crate", "Bag / Sack", "Drum", "Loose Cargo", "Other",
] as const;

export const WEIGHT_UNITS = ["KG", "MT"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export function weightToKilograms(value: string, unit: WeightUnit) {
  if (value === "") return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return Number.NaN;
  return unit === "MT" ? numericValue * 1000 : numericValue;
}

export function convertWeightDisplay(value: string, from: WeightUnit, to: WeightUnit) {
  if (value === "" || from === to) return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return String(from === "KG" ? numericValue / 1000 : numericValue * 1000);
}

export function weightHelper(unit: WeightUnit) {
  return unit === "MT"
    ? "Total cargo weight in metric tons. 1 MT = 1,000 kg."
    : "Total cargo weight in kilograms.";
}

export const PACKAGE_HELPERS = {
  itemDescription: "Describe the goods only. Example: Copper Cathodes",
  packageType: "How the cargo is packed or transported.",
  packageQuantity: "Number of packages or transport units. Example: 1 container or 20 pallets.",
} as const;
