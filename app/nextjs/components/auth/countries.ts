export type Country = {
  code: string;
  flag: string;
  name: string;
};

export const COUNTRIES: Country[] = [
  { code: "+52", flag: "🇲🇽", name: "Mexico" },
  { code: "+1",  flag: "🇺🇸", name: "United States" },
  { code: "+34", flag: "🇪🇸", name: "Spain" },
  { code: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "+54", flag: "🇦🇷", name: "Argentina" },
  { code: "+57", flag: "🇨🇴", name: "Colombia" },
  { code: "+56", flag: "🇨🇱", name: "Chile" },
  { code: "+51", flag: "🇵🇪", name: "Peru" },
  { code: "+55", flag: "🇧🇷", name: "Brazil" },
];

export const DEFAULT_COUNTRY: Country = COUNTRIES[0];
