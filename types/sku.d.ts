export type SkuStatus = "active" | "inactive";

export interface SkuConfig {
  id: string;
  name: string;
  jdUrl: string;
  url?: string;
  jdSkuId?: string;
  series?: string;
  enabled: boolean;
  status: SkuStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface SkuMutationResult {
  sku?: SkuConfig | null;
  deletedId?: string;
  skus: SkuConfig[];
  updatedAt: string;
}
