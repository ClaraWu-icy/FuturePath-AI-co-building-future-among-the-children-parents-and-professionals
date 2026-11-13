/**
 * 云服务公共配置（appId: wbapp_eDEHqThtjwNlTxDMWY15ZC）。
 *
 * 这四个值是 workbuddy_cloud_service 开通后返回的 publicConfig，原样写入，
 * 不要手改、不要从 env / location 推导：endpoint 与 publishableKey 必须成对且属于同一个应用，
 * 服务端会按 Origin 精确匹配，改错一个字就会在登录时静默失败。
 *
 * publishableKey 只用于标识「这是哪个应用」，本身不带任何权限；
 * 真正的数据边界在云数据库的 RLS 上（owner_id = auth.uid()）。
 */
export const publicConfig = {
  resourceId: 'wbcs_1Br2p3eFFYpMA5fK2rBK3W',
  endpoint: 'https://futurepath-ai-33500.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_eDEHqThtjwNlTxDMWY15ZC_rb4NgIa3Lytg6ssij2XZeApurxepsJg6'
};

export default publicConfig;
