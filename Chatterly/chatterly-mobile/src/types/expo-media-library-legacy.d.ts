declare module 'expo-media-library/legacy' {
  export type Asset = {
    id: string;
    filename: string;
    uri: string;
    mediaType: 'audio' | 'photo' | 'video' | 'unknown';
    mediaSubtypes?: string[];
    width: number;
    height: number;
    creationTime: number;
    modificationTime: number;
    duration: number;
    albumId?: string;
  };

  export type AssetInfo = Asset & {
    localUri?: string;
    location?: {latitude: number; longitude: number};
    exif?: Record<string, unknown>;
  };

  export type PermissionResponse = {
    status: 'denied' | 'granted' | 'undetermined';
    granted: boolean;
    expires: 'never' | number;
    canAskAgain: boolean;
    accessPrivileges?: 'all' | 'limited' | 'none';
  };

  export function getPermissionsAsync(
    writeOnly?: boolean,
    granularPermissions?: Array<'audio' | 'photo' | 'video'>,
  ): Promise<PermissionResponse>;

  export function requestPermissionsAsync(
    writeOnly?: boolean,
    granularPermissions?: Array<'audio' | 'photo' | 'video'>,
  ): Promise<PermissionResponse>;

  export function getAssetsAsync(options?: {
    first?: number;
    after?: string;
    album?: string;
    mediaType?: string | string[];
    sortBy?: string | Array<string | [string, boolean]>;
    createdAfter?: Date | number;
    createdBefore?: Date | number;
    resolveWithFullInfo?: boolean;
  }): Promise<{
    assets: Asset[];
    endCursor: string;
    hasNextPage: boolean;
    totalCount: number;
  }>;

  export function getAssetInfoAsync(
    asset: Asset | string,
    options?: {shouldDownloadFromNetwork?: boolean},
  ): Promise<AssetInfo>;

  export function saveToLibraryAsync(localUri: string): Promise<void>;
}
