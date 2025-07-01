export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  license: string;
  author: string | {
    name: string;
    url?: string;
  };
  repository: {
    type: string;
    url: string;
  };
  homepage: string;
  bugs: {
    url: string;
  };
  keywords: string[];
}

export interface SystemInfo {
  appName: string;
  appVersion: string;
  os: string;
  arch: string;
  nodeVersion: string;
  electronVersion: string;
  packageInfo: PackageInfo | null;
}

export interface StorageUsage {
  totalUsed: number;
  available: number;
  downloads: number;
  cache: number;
  temp: number;
} 