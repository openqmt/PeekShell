/** 主机认证方式：密码或私钥文件。 */
export type AuthType = "password" | "privateKey";

/** 主机连接配置（不含密钥明文，密钥由后端钥匙串保管）。 */
export interface HostRecord {
  id: string;
  name: string;
  group: string;
  host: string;
  port: number;
  note: string;
  username: string;
  authType: AuthType;
  /** 仅公钥模式：本地私钥路径 */
  privateKeyPath?: string | null;
  /** 是否已保存对应凭证（密码或私钥口令） */
  hasSecret: boolean;
}

/** 新建 / 编辑主机时前端提交的表单。 */
export interface HostUpsert {
  id?: string;
  name: string;
  group: string;
  host: string;
  port: number;
  note: string;
  username: string;
  authType: AuthType;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
}

/** 侧栏展示的远端主机指标快照。 */
export interface HostMetrics {
  ip: string;
  os: string;
  kernel: string;
  arch: string;
  hostname: string;
  uptimeDays: number;
  uptimeText: string;
  loadAvg: string;
  cpuPercent: number;
  memUsedGiB: number;
  memTotalGiB: number;
  swapUsedMiB: number;
  swapTotalMiB: number;
  diskUsedGiB: number;
  diskTotalGiB: number;
  netIface: string;
  netRxMBs: number;
  netTxKBs: number;
  netRxTotalGB: number;
  netTxTotalGB: number;
}

export interface SessionInfo {
  sessionId: string;
  hostId: string;
  title: string;
}

export interface RemoteEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface RemoteDirListing {
  path: string;
  entries: RemoteEntry[];
}

export interface RemoteFileContent {
  path: string;
  size: number;
  truncated: boolean;
  content: string;
  binary: boolean;
}
