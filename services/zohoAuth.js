import axios from "axios";

let tokenCache = {
  accessToken: process.env.ZOHO_ACCESS_TOKEN || null,
  expiresAt: process.env.ZOHO_TOKEN_EXPIRES_AT
    ? new Date(process.env.ZOHO_TOKEN_EXPIRES_AT).getTime()
    : 0,
};

async function refreshToken() {
  const url = `${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token`;
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });

  const res = await axios.post(url, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: parseInt(process.env.ZOHO_TIMEOUT || "15000", 10),
  });

  const { access_token, expires_in } = res.data;
  tokenCache.accessToken = access_token;
  tokenCache.expiresAt = Date.now() + (parseInt(expires_in, 10) - 60) * 1000;
  return access_token;
}

export async function getAccessToken(force = false) {
  if (force || !tokenCache.accessToken || Date.now() > tokenCache.expiresAt) {
    return await refreshToken();
  }
  return tokenCache.accessToken;
}

export function zohoClient() {
  const instance = axios.create({
    baseURL: process.env.ZOHO_API_BASE_URL,
    timeout: parseInt(process.env.ZOHO_TIMEOUT || "15000", 10),
  });

  instance.interceptors.request.use(async (config) => {
    const token = await getAccessToken();
    config.headers.Authorization = `Zoho-oauthtoken ${token}`;
    return config;
  });

  instance.interceptors.response.use(
    (r) => r,
    async (error) => {
      if (error.response && error.response.status === 401) {
        await getAccessToken(true);
        error.config.headers.Authorization = `Zoho-oauthtoken ${tokenCache.accessToken}`;
        return axios.request(error.config);
      }
      throw error;
    }
  );

  return instance;
}