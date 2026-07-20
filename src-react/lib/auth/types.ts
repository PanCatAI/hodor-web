export interface PancatAccount {
  username: string;
  partnerId: string;
  partnerName: string;
  role: string;
}

export interface PancatLoginSession {
  token: string;
  id: string;
  name: string;
  partnerId: string;
  partnerName: string;
  role: string;
}

export interface PancatCredentials {
  username: string;
  password: string;
}
