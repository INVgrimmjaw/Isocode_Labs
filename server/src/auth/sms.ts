/** The seam for a real SMS provider. The brief asks for outside systems to be mocked. */
export interface SmsGateway {
  sendOtp(phone: string, code: string): Promise<void>;
}

export const mockSmsGateway: SmsGateway = {
  async sendOtp() {
    // Deliberately silent: an OTP in server logs would be a credential in server logs.
  },
};
