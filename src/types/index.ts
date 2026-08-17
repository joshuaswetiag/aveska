export type VehicleExtraction = {
  make: string | null;
  model: string | null;
  vehicleFamily: string | null;
  series: string[];
  generation: string | null;
  bodyType: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  engine: string | null;
  engineCode: string | null;
  variant: string | null;
  driveType: string | null;
  application: string | null;
  vehicleAliases: string[];
  productType: string | null;
  confidence: number;
  evidence: string[];
};

export type LearnedVehicleKnowledge = {
  makes: string[];
  families: Array<{ make: string; family: string; aliases: string[] }>;
  series: Array<{ make?: string; family?: string; code: string }>;
  aliases: Array<{ alias: string; make?: string; family?: string; series?: string[] }>;
};

export type FitmentProfile = {
  make: string | null;
  model: string | null;
  vehicleFamily: string | null;
  series: string[];
  bodyType: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  application: string | null;
};

export type ScoreReason = {
  code: string;
  label: string;
  points: number;
};

export type RecommendationScore = {
  score: number;
  scoreRaw: number;
  confidence: number;
  matchLevel: "EXACT" | "SAME_SERIES" | "SAME_FAMILY" | "RELATED_APPLICATION" | "INSUFFICIENT_DATA";
  reasons: ScoreReason[];
  eligible: boolean;
  exclusionReason?: string;
};

export type ColumnField =
  | "customer_id"
  | "customer_name"
  | "email"
  | "phone"
  | "order_id"
  | "order_date"
  | "sku"
  | "product_id"
  | "product_name"
  | "quantity"
  | "unit_price"
  | "order_total"
  | "product_url"
  | "category"
  | "subcategory"
  | "brand"
  | "description"
  | "image_url"
  | "price"
  | "stock"
  | "make"
  | "model"
  | "series"
  | "vehicle"
  | "body_type"
  | "year"
  | "year_from"
  | "year_to"
  | "fitment"
  | "application"
  | "tags"
  | "ignore";

export type ColumnMapping = Record<string, ColumnField>;

export type ParsedRow = Record<string, string | number | null>;

export type EmailCopy = {
  subject: string;
  preheader: string;
  greeting: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
  html: string;
};

export type TemplateVariables = {
  first_name: string;
  vehicle: string;
  make: string;
  model: string;
  series: string;
  purchased_product: string;
  product_1_name: string;
  product_1_url: string;
  product_1_price: string;
  product_2_name: string;
  product_2_url: string;
  product_2_price: string;
  product_3_name: string;
  product_3_url: string;
  product_3_price: string;
  shop_url: string;
  contact_url: string;
};
