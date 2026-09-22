export type Role = 'super_admin' | 'car_owner' | 'car_renter' | 'agent';

export const ROLES: Role[] = ['super_admin', 'car_owner', 'car_renter', 'agent'];

export type CarStatus = 'draft' | 'pending_review' | 'active' | 'inactive' | 'rejected';
export type BookingStatus = 'requested' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';
export type KycStatus = 'pending' | 'approved' | 'rejected';
export type KycDocType = 'id_proof' | 'address_proof';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: 'pending_otp' | 'active' | 'suspended' | 'banned';
  kyc_status: KycStatus;
}

export interface JwtPayload {
  sub: string;
  role: Role;
}

export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  requires_2fa?: boolean;
  twofa_token?: string;
  user?: AuthUser;
}

export const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
