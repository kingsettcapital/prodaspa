export interface LoginResponse {
    userId: number;
}

export interface ForgotPasswordResponse {
    userId: number;
    email: string;
}

export interface ResetPasswordResponse {
    userId: number;
}

export interface MfaResponse {
  token: string;
  userId: number;
}

export interface ResendMfaCodeResponse {
  expiry: Date;
  userId: number;
}