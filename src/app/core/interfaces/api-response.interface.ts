export interface ApiResponse<T = unknown> {
  isSuccess: boolean;
  data?: T;
  message?: string;
  status?: number;
  statusCode?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages?: number;
}