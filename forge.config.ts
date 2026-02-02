import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerZIP } from '@electron-forge/maker-zip'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import type { ForgeConfig } from '@electron-forge/shared-types'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Clipy',
    executableName: 'clipy',
    appBundleId: 'com.clipy.app',
    appCopyright: `Copyright © ${new Date().getFullYear()} Clipy`,
    darwinDarkModeSupport: true,
    icon: './src/assets/icon',
    // Include the entire resources folder which contains platform-specific binaries
    // Structure should be:
    //   resources/
    //   ├── ffmpeg.exe (Windows)
    //   ├── yt-dlp.exe (Windows)
    //   ├── ffmpeg (macOS/Linux - no extension)
    //   └── yt-dlp (macOS/Linux - no extension)
    // The app uses PlatformUtils.resolveExecutable() to find the correct binary
    // If bundled binaries aren't found, it falls back to system PATH
    extraResource: ['./resources'],
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerRpm({
      options: {
        categories: ['AudioVideo', 'Video'],
        description: 'Professional YouTube video downloader and editor',
      },
    }),
    new MakerDeb({
      options: {
        categories: ['AudioVideo', 'Video'],
        description: 'Professional YouTube video downloader and editor',
        section: 'video',
        maintainer: 'BankkRoll',
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.ts',
            config: 'vite.main.config.ts',
            target: 'main',
          },
          {
            entry: 'src/preload.ts',
            config: 'vite.preload.config.ts',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mts',
          },
        ],
      },
    },

    new FusesPlugin({
      version: FuseVersion.V1,
      // Security: Disable dangerous Node.js features
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // Security: ASAR integrity and loading
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // Security: Encryption and protocol restrictions
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
}

export default config
