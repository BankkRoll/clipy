import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  resources: {
    en: {
      translation: {
        // App Info
        appName: "Clipy",
        appDescription: "Professional YouTube video downloader and editor built with Electron",
        
        // Navigation
        titleHomePage: "Home",
        titleDownloader: "Downloader",
        titleEditor: "Editor",
        titleLibrary: "Library",
        titleSettings: "Settings",
        
        // Page Subtitles
        subtitleHomePage: "Welcome to Professional YouTube Tools",
        subtitleDownloader: "Download YouTube Videos in Original Quality",
        subtitleEditor: "Professional Timeline-Based Video Editor",
        subtitleLibrary: "Your Downloaded Videos & Projects",
        subtitleSettings: "Configure Your Experience",

        // Navigation Menu
        navQuickSettings: "Quick Settings",
        navAdvancedConfiguration: "Advanced configuration",
        navProfessionalYouTubeTools: "Professional YouTube Tools",
        navBackToHome: "Back to Home",
        
        // Home Page
        homeWelcome: "Welcome to the Ultimate YouTube Tool",
        homeDescription: "Download, edit, and manage YouTube videos with professional-grade tools",
        homeFeatures: "Key Features",
        homeFeature1: "Download videos in original quality without re-encoding",
        homeFeature2: "Built-in timeline editor with real-time preview",
        homeFeature3: "Batch download playlists and channels",
        homeFeature4: "Lossless video cutting and merging",
        homeFeature5: "Complete privacy - all processing done locally",
        homeFeature6: "Cross-platform support for Windows, macOS, and Linux",
        homeGetStarted: "Get Started",
        homeDownloadFirst: "Download Your First Video",
        homeLearnMore: "Learn More",
        homeProfessionalYouTubeTools: "Professional YouTube Tools",
        
        // Hero Section
        heroProfessionalTools: "Professional YouTube Tools",
        heroFree: "100% FREE",
        heroDropLinkDownload: "Drop a YouTube link to download",
        heroDropLinkEdit: "Drop a YouTube link to edit",
        heroUrlPlaceholder: "https://www.youtube.com/watch?v=...",
        heroGet1Click: "Get video in 1 click",
        heroEdit1Click: "Start editing in 1 click",
        
        // Hero Stats
        heroStats4KSupport: "4K, 1080p, 720p Support",
        heroStatsRealTime: "Real-time Processing",
        heroStatsLossless: "Lossless Cutting",
        heroStatsPrivacy: "100% Privacy Focused",
        
        // Settings Page
        settingsTitle: "Settings",
        settingsSubtitle: "Configure your preferences and customize your experience",
        settingsLuxuryInterface: "Luxury Interface",
        settingsActive: "Active",
        settingsComingSoon: "Coming Soon",
        settingsRecommended: "Recommended",
        
        // Language Settings
        settingsLanguageTitle: "Language & Region",
        settingsLanguageDescription: "Choose your preferred language for the application interface",
        settingsLanguagePackInfo: "Language Pack Info",
        settingsLanguagePackDescription: "Interface language changes will be applied immediately. More languages will be added in future updates.",
        
        // Appearance Settings
        settingsAppearanceTitle: "Appearance & Theme",
        settingsAppearanceDescription: "Customize the visual appearance and theme of the application",
        settingsColorTheme: "Color Theme",
        settingsThemeLight: "Light",
        settingsThemeLightDesc: "Clean and bright",
        settingsThemeDark: "Dark",
        settingsThemeDarkDesc: "Easy on the eyes",
        settingsThemeSystem: "System",
        settingsThemeSystemDesc: "Follow OS setting",
        settingsQuickToggle: "Quick toggle",
        settingsVisualPreferences: "Visual Preferences",
        settingsInterfaceScale: "Interface Scale",
        settingsInterfaceScaleDesc: "Adjust the size of text and UI elements",
        settingsSmoothAnimations: "Smooth Animations",
        settingsSmoothAnimationsDesc: "Enable transitions and micro-interactions",
        settingsCompactInterface: "Compact Interface",
        settingsCompactInterfaceDesc: "Reduce spacing for more content density",
        settingsAccessibility: "Accessibility",
        settingsHighContrast: "High Contrast Mode",
        settingsHighContrastDesc: "Enhance contrast for better visibility",
        settingsReduceMotion: "Reduce Motion",
        settingsReduceMotionDesc: "Minimize animations for motion sensitivity",
        settingsAccessibilityNote: "Additional accessibility features will be available in future updates",
        settingsScaleSmall: "Small",
        settingsScaleMedium: "Medium",
        settingsScaleLarge: "Large",
        
        // Download Settings
        settingsDownloadTitle: "Download Preferences",
        settingsDownloadDescription: "Configure default download settings and behavior for optimal performance",
        settingsQualityFormat: "Quality & Format",
        settingsDefaultVideoQuality: "Default Video Quality",
        settingsBestAvailable: "Best Available",
        settingsMostCompatible: "Most Compatible",
        settingsVideoFormat: "Video Format",
        settingsSmartQualityTitle: "Smart Quality Selection",
        settingsSmartQualityDesc: "Automatically chooses the best quality available without re-encoding to preserve original quality.",
        settingsStorageLocation: "Storage Location",
        settingsDownloadDirectory: "Download Directory",
        settingsDownloadDirectoryDesc: "All downloaded videos will be saved to this location",
        settingsCreateSubdirectories: "Create Subdirectories",
        settingsCreateSubdirectoriesDesc: "Organize downloads by channel/playlist",
        settingsAdditionalContent: "Additional Content",
        settingsDownloadSubtitles: "Download Subtitles",
        settingsDownloadSubtitlesDesc: "Auto-download available subtitles",
        settingsDownloadThumbnails: "Download Thumbnails",
        settingsDownloadThumbnailsDesc: "Save video thumbnails and artwork",
        settingsSaveMetadata: "Save Metadata",
        settingsSaveMetadataDesc: "Include video info, description, tags",
        settingsPerformance: "Performance",
        settingsConcurrentDownloads: "Concurrent Downloads",
        settingsConcurrentDownloadsDesc: "Maximum simultaneous downloads",
        settingsAutoRetryFailed: "Auto-retry Failed Downloads",
        settingsAutoRetryFailedDesc: "Automatically retry with exponential backoff",
        settingsPerformanceImpactTitle: "Performance Impact",
        settingsPerformanceImpactDesc: "Higher concurrent downloads may impact system performance and network stability. Adjust based on your hardware capabilities.",
        settingsConservative: "Conservative",
        settingsBalanced: "Balanced",
        settingsAggressive: "Aggressive",
        settingsBrowse: "Browse",
        settingsChange: "Change",
        
        // Editor Settings
        settingsEditorTitle: "Editor Preferences",
        settingsEditorDescription: "Configure video editor settings and performance options",
        settingsHardwareAcceleration: "Hardware Acceleration",
        settingsHardwareAccelerationDesc: "Use GPU for faster video processing",
        settingsAutoSaveProjects: "Auto-save Projects",
        settingsAutoSaveProjectsDesc: "Automatically save projects every few minutes",
        settingsRealtimePreview: "Real-time Preview",
        settingsRealtimePreviewDesc: "Enable timeline scrubbing and live preview",
        settingsTimelineEditorTitle: "Timeline-Based Editor",
        settingsTimelineEditorDesc: "Professional video editing features with timeline scrubbing, real-time preview, and lossless cutting will be available in the upcoming editor module.",
        
        // Storage Settings
        settingsStorageTitle: "Storage & Performance",
        settingsStorageDescription: "Manage disk usage, cache, and performance optimization",
        settingsStorageUsage: "Storage Usage",
        settingsTotalUsed: "Total Used",
        settingsAvailable: "Available",
        settingsCacheManagement: "Cache Management",
        settingsTemporaryFiles: "Temporary Files",
        settingsLastCleared: "Last cleared",
        settingsThumbnailCache: "Thumbnail Cache",
        settingsItems: "items",
        settingsClearCache: "Clear Cache",
        settingsClearThumbnails: "Clear Thumbnails",
        settingsAutoCleanupTitle: "Auto-cleanup",
        settingsAutoCleanupDesc: "Cache files are automatically cleaned when they exceed 1GB or are older than 30 days.",
        settingsDownloadLocations: "Download Locations",
        settingsPrimaryDownloads: "Primary Downloads",
        settingsTemporaryDownloads: "Temporary Downloads",
        settingsDefault: "Default",
        settingsDaysAgo: "days ago",
        
        // About Settings
        settingsAboutTitle: "About {{appName}}",
        settingsAboutDescription: "Application information, version details, and system specifications",
        settingsVersion: "Version",
        settingsBeta: "Beta",
        settingsReleaseDate: "Release Date",
        settingsBuild: "Build",
        settingsDevelopment: "Development",
        settingsPlatform: "Platform",
        settingsPlatformValue: "Electron + React",
        settingsSystemInformation: "System Information",
        settingsOperatingSystem: "Operating System",
        settingsArchitecture: "Architecture",
        settingsLegalResources: "Resources",
        settingsOpenSourceLicense: "Open Source License",
        settingsMITLicense: "MIT License",
        settingsSourceCode: "Source Code",
        settingsSourceCodeDesc: "Available on GitHub",
        settingsDocumentation: "Documentation",
        settingsDocumentationDesc: "User guide and API docs",
        settingsReportIssues: "Report Issues",
        settingsReportIssuesDesc: "Found a bug? Let us know!",
        settingsReportBug: "Report Bug",
        settingsViewLicense: "View License",
        settingsViewOnGitHub: "View on GitHub",
        settingsViewDocs: "View Docs",
        
        // Window Controls
        windowMinimize: "Minimize",
        windowMaximize: "Maximize",
        windowClose: "Close",
        toggleTheme: "Toggle theme",
        
        // Downloader
        downloadTitle: "Download YouTube Videos",
        downloadSubtitle: "Download videos in original quality with advanced options",
        downloadUrlPlaceholder: "https://www.youtube.com/watch?v=...",
        downloadUrlHelp: "Paste any YouTube video URL to get started",
        downloadGetInfo: "Get Video Info",
        downloadStart: "Download",
        downloadNew: "Download New",
        downloadProgress: "Download Progress",
        downloading: "Downloading...",
        downloadHistory: "Download History",
        downloadCompleted: "Download Completed",
        downloadFailed: "Download Failed",
        downloadCancelled: "Download Cancelled",
        
        // Video Preview
        toolTrim: "Trim Video",
        trimDuration: "Trim Duration",
        estimatedFileSize: "Estimated File Size",
        estimatedFileSizeDesc: "Based on quality and duration",
        progress: "Progress",
        speed: "Speed",
        eta: "ETA",
        size: "Size",
        
        // Library
        totalDownloads: "Total Downloads",
        activeDownloads: "Active Downloads",
        completedDownloads: "Completed Downloads",
        failedDownloads: "Failed Downloads",
        searchDownloads: "Search downloads...",
        filterAll: "All Downloads",
        filterActive: "Active",
        filterCompleted: "Completed",
        filterFailed: "Failed",
        noDownloads: "No Downloads Yet",
        noDownloadsDesc: "Start downloading videos to see them here",
        startDownloading: "Start Downloading",
        downloadedFiles: "Downloaded Files",
        filesComingSoon: "File Management Coming Soon",
        filesComingSoonDesc: "Advanced file management features will be available in future updates",
        
        // Messages
        msgDownloadStarted: "Download started successfully",
        msgDownloadCompleted: "Download completed successfully",
        msgDownloadFailed: "Download failed",
        msgDownloadCancelled: "Download cancelled",
        msgDownloadCancelFailed: "Failed to cancel download",
        msgFileOpenFailed: "Failed to open file",
        msgFolderOpenFailed: "Failed to open folder",
        
        // Status
        statusGettingInfo: "Getting video info...",
        
        // Quality & Format
        quality4k: "4K",
        quality1440p: "1440p",
        quality1080p: "1080p",
        quality720p: "720p",
        quality480p: "480p",
        quality360p: "360p",
        quality240p: "240p",
        quality144p: "144p",
        formatMP4: "MP4",
        formatWebM: "WebM",
        formatMKV: "MKV",
        
        // Buttons
        btnReset: "Reset",
        
        // Errors
        errorGeneric: "An error occurred",
        
        // Coming Soon
        comingSoonLibrary: "Library Management Coming Soon",
        comingSoonLibraryDesc: "Advanced library features including file organization, metadata editing, and batch operations will be available in future updates.",
      },
    },
    // TODO: add other languages 
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
