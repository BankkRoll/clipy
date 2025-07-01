export interface InnerTubeResponse {
    basicInfo:                BasicInfo;
    annotations:              Annotation[];
    storyboards:              Storyboards;
    captions:                 Captions;
    cards:                    Cards;
    streamingData:            StreamingData;
    playabilityStatus:        PlayabilityStatus;
    playerConfig:             PlayerConfig;
    primaryInfo:              PrimaryInfo;
    secondaryInfo:            SecondaryInfo;
    merchandise:              Merchandise;
    watchNextFeed:            WatchNextFeed[];
    playerOverlays:           PlayerOverlays;
    autoplay:                 Autoplay;
    commentsEntryPointHeader: CommentsEntryPointHeader;
    heatMap:                  null;
}

export interface Annotation {
    type:              string;
    featuredChannel:   FeaturedChannel;
    allowSwipeDismiss: boolean;
    annotationid:      string;
}

export interface FeaturedChannel {
    startTimems:     string;
    endTimems:       string;
    watermark:       Thumbnail[];
    channelName:     string;
    endpoint:        FeaturedChannelEndpoint;
    subscribeButton: SubscribeButton;
}

export interface FeaturedChannelEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     PurpleName;
    payload:  PurplePayload;
    metadata: AutoplayVideoMetadata;
}

export interface OnSubscribeEndpointCommand {
    type: PurpleType;
}

export enum PurpleType {
    BrowseEndpoint = "BrowseEndpoint",
    CreatePlaylistServiceEndpoint = "CreatePlaylistServiceEndpoint",
    FeedbackEndpoint = "FeedbackEndpoint",
    LikeEndpoint = "LikeEndpoint",
    PlaylistEditEndpoint = "PlaylistEditEndpoint",
    ShareEntityServiceEndpoint = "ShareEntityServiceEndpoint",
    ShowEngagementPanelEndpoint = "ShowEngagementPanelEndpoint",
    SubscribeEndpoint = "SubscribeEndpoint",
    UnsubscribeEndpoint = "UnsubscribeEndpoint",
    WatchEndpoint = "WatchEndpoint",
}

export interface AutoplayVideoMetadata {
    url:      string;
    pageType: PageType;
    apiurl?:  Purpleapiurl;
}

export enum Purpleapiurl {
    Browse = "browse",
    Player = "/player",
}

export enum PageType {
    WebPageTypeBrowse = "WEB_PAGE_TYPE_BROWSE",
    WebPageTypeChannel = "WEB_PAGE_TYPE_CHANNEL",
    WebPageTypeUnknown = "WEB_PAGE_TYPE_UNKNOWN",
    WebPageTypeWatch = "WEB_PAGE_TYPE_WATCH",
}

export enum PurpleName {
    BrowseEndpoint = "browseEndpoint",
    UrlEndpoint = "urlEndpoint",
}

export interface PurplePayload {
    browseId: string;
}

export enum EndpointType {
    NavigationEndpoint = "NavigationEndpoint",
}

export interface SubscribeButton {
    type:                          string;
    buttonText:                    HeaderElement;
    subscribed:                    boolean;
    enabled:                       boolean;
    itemType:                      string;
    channelid:                     string;
    showPreferences:               boolean;
    subscribedText:                HeaderElement;
    unsubscribedText:              HeaderElement;
    unsubscribeText:               HeaderElement;
    notificationPreferenceButton:  NotificationPreferenceButton | null;
    serviceEndpoints?:             ServiceEndpointElement[];
    subscribeAccessibilityLabel:   string;
    unsubscribeAccessibilityLabel: string;
    onSubscribeEndpoints?:         OnSubscribeEndpointElement[];
    onUnsubscribeEndpoints?:       OnUnsubscribeEndpoint[];
    subscribedEntityKey?:          string;
    targetid?:                     string;
}

export interface HeaderElement {
    runs: HeaderRun[];
    text: string;
    rtl:  boolean;
}

export interface HeaderRun {
    text:           string;
    bold:           boolean;
    bracket:        boolean;
    italics:        boolean;
    strikethrough:  boolean;
    errorUnderline: boolean;
    underline:      boolean;
    deemphasize:    boolean;
    textColor?:     number;
    endpoint?:      RunEndpoint;
    attachment?:    Attachment;
}

export interface Attachment {
    startIndex: number;
    length:     number;
    element:    Element;
    alignment:  string;
}

export interface Element {
    type:       TypeClass;
    properties: Properties;
}

export interface Properties {
    layoutProperties: LayoutProperties;
}

export interface LayoutProperties {
    height: Height;
    width:  Height;
    margin: Margin;
}

export interface Height {
    value: number;
    unit:  Unit;
}

export enum Unit {
    DimensionUnitPoint = "DIMENSION_UNIT_POINT",
}

export interface Margin {
    top: Height;
}

export interface TypeClass {
    imageType: ImageType;
}

export interface ImageType {
    image: Image;
}

export interface Image {
    sources: CommonConfig[];
}

export interface CommonConfig {
    url: string;
}

export interface RunEndpoint {
    type:     EndpointType;
    name:     PurpleName;
    payload:  FluffyPayload;
    metadata: AutoplayVideoMetadata;
    command?: OnSubscribeEndpointCommand;
}

export interface FluffyPayload {
    url?:              string;
    target?:           TargetEnum;
    browseId?:         string;
    params?:           string;
    nofollow?:         boolean;
    canonicalBaseUrl?: string;
}

export enum TargetEnum {
    TargetNewWindow = "TARGET_NEW_WINDOW",
}

export interface NotificationPreferenceButton {
    type:           string;
    states:         State[];
    currentStateid: number;
    targetid:       string;
}

export interface State {
    id:     number;
    nextid: number;
    state:  PayloadClass;
}

export interface PayloadClass {
}

export interface OnSubscribeEndpointElement {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     string;
    payload:  UnsubscribeEndpointClass;
    metadata: OnSubscribeEndpointMetadata;
}

export interface OnSubscribeEndpointMetadata {
    apiurl?:   Fluffyapiurl;
    sendPost?: boolean;
}

export enum Fluffyapiurl {
    BrowseEditPlaylist = "browse/edit_playlist",
    FlagGetForm = "flag/get_form",
    GetSurvey = "get_survey",
    LikeDislike = "like/dislike",
    LikeLike = "like/like",
    LikeRemovelike = "like/removelike",
    PlaylistCreate = "playlist/create",
    ShareGetSharePanel = "share/get_share_panel",
    SubscriptionSubscribe = "subscription/subscribe",
    SubscriptionUnsubscribe = "subscription/unsubscribe",
}

export interface UnsubscribeEndpointClass {
    channelIds: string[];
    params:     string;
}

export interface OnUnsubscribeEndpoint {
    type:     EndpointType;
    command:  OnUnsubscribeEndpointCommand;
    name:     OnUnsubscribeEndpointName;
    payload:  OnUnsubscribeEndpointPayload;
    metadata: OnUnsubscribeEndpointMetadata;
}

export interface OnUnsubscribeEndpointCommand {
    type:     string;
    actions?: PurpleAction[];
    signal?:  Signal;
}

export interface PurpleAction {
    type:      ActionType;
    popup:     PurplePopup;
    popupType: CommandPopupType;
}

export interface PurplePopup {
    type:           string;
    title:          ExtraShortViewCount;
    confirmButton:  ConfirmButton;
    cancelButton:   CloseButtonClass;
    dialogMessages: HeaderElement[];
}

export interface CloseButtonClass {
    type:       string;
    text?:      string;
    label:      string;
    style:      string;
    size:       string;
    isDisabled: boolean;
    endpoint:   CloseButtonEndpoint;
    iconType?:  string;
}

export interface CloseButtonEndpoint {
    type:     EndpointType;
    payload:  PayloadClass;
    metadata: PayloadClass;
}

export interface ConfirmButton {
    type:       string;
    text:       string;
    label:      string;
    style:      string;
    size:       string;
    isDisabled: boolean;
    endpoint:   OnSubscribeEndpointElement;
}

export interface ExtraShortViewCount {
    rtl: boolean;
}

export enum CommandPopupType {
    Dialog = "DIALOG",
}

export enum ActionType {
    AddToPlaylistCommand = "AddToPlaylistCommand",
    OpenPopupAction = "OpenPopupAction",
}

export enum Signal {
    ClientSignal = "CLIENT_SIGNAL",
}

export interface OnUnsubscribeEndpointMetadata {
    sendPost: boolean;
}

export enum OnUnsubscribeEndpointName {
    OfflineVideoEndpoint = "offlineVideoEndpoint",
    ShareEntityServiceEndpoint = "shareEntityServiceEndpoint",
    ShowEngagementPanelEndpoint = "showEngagementPanelEndpoint",
    SignInEndpoint = "signInEndpoint",
    SignalServiceEndpoint = "signalServiceEndpoint",
}

export interface OnUnsubscribeEndpointPayload {
    signal:  Signal;
    actions: FluffyAction[];
}

export interface FluffyAction {
    openPopupAction: PurpleOpenPopupAction;
}

export interface PurpleOpenPopupAction {
    popup:     FluffyPopup;
    popupType: CommandPopupType;
}

export interface FluffyPopup {
    confirmDialogRenderer: ConfirmDialogRenderer;
}

export interface ConfirmDialogRenderer {
    trackingParams:  string;
    dialogMessages:  Content[];
    confirmButton:   CancelButtonClass;
    cancelButton:    CancelButtonClass;
    primaryIsCancel: boolean;
}

export interface CancelButtonClass {
    buttonRenderer: CancelButtonButtonRenderer;
}

export interface CancelButtonButtonRenderer {
    style:            string;
    size:             string;
    isDisabled:       boolean;
    text:             Content;
    accessibility:    AccessibilityDataClass;
    trackingParams:   string;
    serviceEndpoint?: ServiceEndpoint;
}

export interface AccessibilityDataClass {
    label: string;
}

export interface ServiceEndpoint {
    clickTrackingParams: string;
    commandMetadata:     ServiceEndpointCommandMetadata;
    unsubscribeEndpoint: UnsubscribeEndpointClass;
}

export interface ServiceEndpointCommandMetadata {
    webCommandMetadata: PurpleWebCommandMetadata;
}

export interface PurpleWebCommandMetadata {
    sendPost: boolean;
    apiUrl:   ApiUrl;
}

export enum ApiUrl {
    YoutubeiV1FlagGetForm = "/youtubei/v1/flag/get_form",
    YoutubeiV1LikeDislike = "/youtubei/v1/like/dislike",
    YoutubeiV1LikeLike = "/youtubei/v1/like/like",
    YoutubeiV1LikeRemovelike = "/youtubei/v1/like/removelike",
    YoutubeiV1PlaylistCreate = "/youtubei/v1/playlist/create",
    YoutubeiV1ShareGetSharePanel = "/youtubei/v1/share/get_share_panel",
    YoutubeiV1SubscriptionUnsubscribe = "/youtubei/v1/subscription/unsubscribe",
}

export interface Content {
    runs: DialogMessageRun[];
}

export interface DialogMessageRun {
    text: string;
}

export interface ServiceEndpointElement {
    type:     EndpointType;
    command:  OnUnsubscribeEndpointCommand;
    name:     string;
    payload:  ServiceEndpointPayload;
    metadata: OnSubscribeEndpointMetadata;
}

export interface ServiceEndpointPayload {
    channelIds?: string[];
    params?:     string;
    signal?:     Signal;
    actions?:    FluffyAction[];
}

export interface Thumbnail {
    url:    string;
    width:  number;
    height: number;
}

export interface Autoplay {
    sets:          Set[];
    countDownSecs: number;
}

export interface Set {
    autoplayVideo: AutoplayVideo;
}

export interface AutoplayVideo {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     AutoplayVideoName;
    payload:  AutoplayVideoPayload;
    metadata: AutoplayVideoMetadata;
}

export enum AutoplayVideoName {
    WatchEndpoint = "watchEndpoint",
}

export interface AutoplayVideoPayload {
    videoId:                              string;
    params:                               string;
    playerParams:                         string;
    watchEndpointSupportedPrefetchConfig: WatchEndpointSupportedPrefetchConfig;
}

export interface WatchEndpointSupportedPrefetchConfig {
    prefetchHintConfig: PrefetchHintConfig;
}

export interface PrefetchHintConfig {
    prefetchPriority:                            number;
    countdownUiRelativeSecondsPrefetchCondition: number;
}

export interface BasicInfo {
    id:                     Id;
    channelid:              string;
    title:                  string;
    duration:               number;
    keywords:               string[];
    isOwnerViewing:         boolean;
    shortDescription:       string;
    thumbnail:              Thumbnail[];
    allowRatings:           boolean;
    viewCount:              number;
    author:                 string;
    isPrivate:              boolean;
    isLive:                 boolean;
    isLiveContent:          boolean;
    isLivedvrEnabled:       boolean;
    isLowLatencyLiveStream: boolean;
    isUpcoming:             boolean;
    isPostLivedvr:          boolean;
    isCrawlable:            boolean;
    embed:                  Embed;
    channel:                Channel;
    isUnlisted:             boolean;
    isFamilySafe:           boolean;
    category:               string;
    hasYpcMetadata:         boolean;
    startTimestamp:         null;
    endTimestamp:           null;
    urlCanonical:           null;
    tags:                   null;
    likeCount:              number;
    isLiked:                boolean;
    isDisliked:             boolean;
}

export interface Channel {
    id:   string;
    name: string;
    url:  string;
}

export interface Embed {
    iframeurl: string;
    width:     number;
    height:    number;
}

export enum Id {
    OVBO4UL9DO0 = "OVBO4uL9DO0",
}

export interface Captions {
    type:                   string;
    captionTracks:          CaptionTrack[];
    audioTracks:            AudioTrackElement[];
    defaultAudioTrackIndex: number;
    translationLanguages:   TranslationLanguage[];
}

export interface AudioTrackElement {
    audioTrackid:        string;
    captionTrackIndices: number[];
}

export interface CaptionTrack {
    baseurl:        string;
    name:           CommentCountClass;
    vssid:          string;
    languageCode:   string;
    kind:           string;
    isTranslatable: boolean;
}

export interface CommentCountClass {
    text: string;
    rtl:  boolean;
}

export interface TranslationLanguage {
    languageCode: string;
    languageName: CommentCountClass;
}

export interface Cards {
    type:               string;
    cards:              Card[];
    header:             CommentCountClass;
    allowTeaserDismiss: boolean;
}

export interface Card {
    type:      string;
    teaser:    Teaser;
    content:   null;
    cueRanges: CueRange[];
}

export interface CueRange {
    startCardActivems: string;
    endCardActivems:   string;
    teaserDurationms:  string;
    iconAfterTeaserms: string;
}

export interface Teaser {
    type:      string;
    message:   CommentCountClass;
    prominent: boolean;
}

export interface CommentsEntryPointHeader {
    type:            string;
    header:          HeaderElement;
    commentCount:    CommentCountClass;
    contentRenderer: ContentRenderer;
}

export interface ContentRenderer {
    type:          string;
    teaserAvatar:  Thumbnail[];
    teaserContent: HeaderElement;
}

export interface Merchandise {
    type:  string;
    title: string;
    menu:  Menu;
    items: MerchandiseItem[];
}

export interface MerchandiseItem {
    type:                    string;
    title:                   string;
    description:             string;
    thumbnails:              Thumbnail[];
    price:                   string;
    vendorName:              string;
    buttonText:              string;
    buttonAccessibilityText: string;
    fromVendorText:          string;
    additionalFeesText:      string;
    endpoint:                PurpleEndpoint;
}

export interface PurpleEndpoint {
    type:     EndpointType;
    command:  PurpleCommand;
    name:     string;
    payload:  TentacledPayload;
    metadata: PayloadClass;
}

export interface PurpleCommand {
    type:     string;
    commands: OnSubscribeEndpointCommand[];
}

export interface TentacledPayload {
    commands: FluffyCommand[];
}

export interface FluffyCommand {
    clickTrackingParams: string;
    commandMetadata:     CommandCommandMetadata;
    feedbackEndpoint?:   FeedbackEndpoint;
    urlEndpoint?:        UrlEndpoint;
}

export interface CommandCommandMetadata {
    webCommandMetadata: FluffyWebCommandMetadata;
}

export interface FluffyWebCommandMetadata {
    sendPost?:    boolean;
    apiUrl?:      string;
    url?:         string;
    webPageType?: PageType;
    rootVe?:      number;
}

export interface FeedbackEndpoint {
    feedbackToken: string;
}

export interface UrlEndpoint {
    url:    string;
    target: TargetEnum;
}

export interface Menu {
    type:            MenuType;
    items:           MenuItem[];
    flexibleItems:   FlexibleItem[];
    topLevelButtons: TopLevelButtonElement[];
    accessibility?:  MenuAccessibility;
}

export interface MenuAccessibility {
    accessibilityData: AccessibilityDataClass;
}

export interface FlexibleItem {
    type:           string;
    menuItem:       MenuItemClass;
    topLevelButton: FlexibleItemTopLevelButton;
}

export interface MenuItemClass {
    type:          MenuItemType;
    hasSeparator?: boolean;
    endpoint:      MenuItemEndpoint;
    text?:         string;
    iconType?:     string;
}

export interface MenuItemEndpoint {
    type:     EndpointType;
    name:     string;
    payload:  IndigoPayload;
    metadata: PayloadClass;
    modal?:   EndpointModal;
}

export interface EndpointModal {
    type:    string;
    title:   HeaderElement;
    content: HeaderElement;
    button:  PurpleButton;
}

export interface PurpleButton {
    type:       string;
    text:       TextEnum;
    style:      string;
    size:       string;
    isDisabled: boolean;
    endpoint:   FluffyEndpoint;
}

export interface FluffyEndpoint {
    type:         EndpointType;
    name:         OnUnsubscribeEndpointName;
    payload:      StickyPayload;
    nextEndpoint: NextEndpointClass;
    metadata:     PurpleMetadata;
}

export interface PurpleMetadata {
    url?:      string;
    pageType?: PageType;
}

export interface NextEndpointClass {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     AutoplayVideoName;
    payload:  NextEndpointWatchEndpoint;
    metadata: AutoplayVideoMetadata;
}

export interface NextEndpointWatchEndpoint {
    videoId:                            string;
    watchEndpointSupportedOnesieConfig: WatchEndpointSupportedOnesieConfig;
}

export interface WatchEndpointSupportedOnesieConfig {
    html5PlaybackOnesieConfig: Html5PlaybackOnesieConfig;
}

export interface Html5PlaybackOnesieConfig {
    commonConfig: CommonConfig;
}

export interface StickyPayload {
    nextEndpoint: PurpleNextEndpoint;
    idamTag:      string;
}

export interface PurpleNextEndpoint {
    clickTrackingParams: string;
    commandMetadata:     NavigationEndpointCommandMetadata;
    watchEndpoint:       NextEndpointWatchEndpoint;
}

export interface NavigationEndpointCommandMetadata {
    webCommandMetadata: TentacledWebCommandMetadata;
}

export interface TentacledWebCommandMetadata {
    url:         string;
    webPageType: PageType;
    rootVe:      number;
}

export enum TextEnum {
    AddedToQueue = "Added to queue",
    DonTLikeThisVideo = "Don't like this video?",
    LikeThisVideo = "Like this video?",
    SignIn = "Sign in",
    SignInToMakeYourOpinionCount = "Sign in to make your opinion count.",
}

export interface IndigoPayload {
    videoId?:      Id;
    onAddCommand?: PurpleOnAddCommand;
    modal?:        PurpleModal;
}

export interface PurpleModal {
    modalWithTitleAndButtonRenderer: PurpleModalWithTitleAndButtonRenderer;
}

export interface PurpleModalWithTitleAndButtonRenderer {
    title:   Content;
    content: Content;
    button:  FluffyButton;
}

export interface FluffyButton {
    buttonRenderer: PurpleButtonRenderer;
}

export interface PurpleButtonRenderer {
    style:              string;
    size:               string;
    isDisabled:         boolean;
    text:               TextClass;
    navigationEndpoint: PurpleNavigationEndpoint;
    trackingParams:     string;
}

export interface PurpleNavigationEndpoint {
    clickTrackingParams: string;
    commandMetadata:     NavigationEndpointCommandMetadata;
    signInEndpoint:      StickyPayload;
}

export interface TextClass {
    simpleText: TextEnum;
}

export interface PurpleOnAddCommand {
    clickTrackingParams:      string;
    getDownloadActionCommand: PurpleGetDownloadActionCommand;
}

export interface PurpleGetDownloadActionCommand {
    videoId:                 Id;
    params:                  string;
    offlineabilityEntityKey: string;
}

export enum MenuItemType {
    MenuServiceItem = "MenuServiceItem",
    MenuServiceItemDownload = "MenuServiceItemDownload",
}

export interface FlexibleItemTopLevelButton {
    type:               string;
    style:              string;
    size?:              string;
    endpoint?:          TopLevelButtonEndpoint;
    targetid?:          string;
    iconName?:          string;
    tooltip?:           string;
    buttonSize?:        string;
    isFullWidth?:       boolean;
    onTap?:             PurpleOnTap;
    title?:             string;
    buttonType?:        string;
    accessibilityText?: string;
}

export interface TopLevelButtonEndpoint {
    type:     EndpointType;
    name:     OnUnsubscribeEndpointName;
    payload:  IndecentPayload;
    metadata: PayloadClass;
}

export interface IndecentPayload {
    videoId:      Id;
    onAddCommand: PurpleOnAddCommand;
}

export interface PurpleOnTap {
    type:     EndpointType;
    commands: TentacledCommand[];
    name:     string;
    payload:  AmbitiousPayload;
    metadata: PayloadClass;
}

export interface TentacledCommand {
    type:     EndpointType;
    name:     string;
    payload:  HilariousPayload;
    metadata: PayloadClass;
    modal?:   EndpointModal;
}

export interface HilariousPayload {
    gestureType?:    string;
    trackingParams?: string;
    modal?:          PurpleModal;
}

export interface AmbitiousPayload {
    commands: StickyCommand[];
}

export interface StickyCommand {
    logGestureCommand?: LogGestureCommand;
    innertubeCommand?:  PurpleInnertubeCommand;
}

export interface PurpleInnertubeCommand {
    clickTrackingParams: string;
    commandMetadata:     PurpleCommandMetadata;
    modalEndpoint:       PurpleModalEndpoint;
}

export interface PurpleCommandMetadata {
    webCommandMetadata: StickyWebCommandMetadata;
}

export interface StickyWebCommandMetadata {
    ignoreNavigation: boolean;
}

export interface PurpleModalEndpoint {
    modal: PurpleModal;
}

export interface LogGestureCommand {
    gestureType:    string;
    trackingParams: string;
}

export interface MenuItem {
    type:          MenuItemType;
    text?:         AccessibilityTextEnum;
    iconType?:     Icon;
    endpoint:      TentacledEndpoint;
    hasSeparator?: boolean;
}

export interface TentacledEndpoint {
    type:          EndpointType;
    command?:      IndigoCommand;
    openPopup?:    OpenPopup;
    payload:       CunningPayload;
    metadata:      FluffyMetadata;
    name?:         OnUnsubscribeEndpointName;
    nextEndpoint?: FluffyNextEndpoint;
}

export interface IndigoCommand {
    type:       FluffyType;
    popup?:     CommandPopup;
    popupType?: CommandPopupType;
    actions?:   TentacledAction[];
    signal?:    Signal;
}

export interface TentacledAction {
    type:            ActionType;
    openMiniplayer?: boolean;
    videoid?:        string;
    listType?:       ListType;
    endpoint?:       ActionEndpoint;
    videoids?:       string[];
    popup?:          TentacledPopup;
    popupType?:      PurplePopupType;
}

export interface ActionEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     FluffyName;
    payload:  CreatePlaylistServiceEndpointClass;
    metadata: OnSubscribeEndpointMetadata;
}

export enum FluffyName {
    CreatePlaylistServiceEndpoint = "createPlaylistServiceEndpoint",
}

export interface CreatePlaylistServiceEndpointClass {
    videoIds: string[];
    params:   PayloadParams;
}

export enum PayloadParams {
    CAQ3D = "CAQ%3D",
}

export enum ListType {
    PlaylistEditListTypeQueue = "PLAYLIST_EDIT_LIST_TYPE_QUEUE",
}

export interface TentacledPopup {
    type:         PopupType;
    responseText: CommentCountClass;
}

export enum PopupType {
    NotificationAction = "NotificationAction",
}

export enum PurplePopupType {
    Toast = "TOAST",
}

export interface CommandPopup {
    type:          string;
    dialogMessage: HeaderElement;
    confirmLabel:  CommentCountClass;
}

export enum FluffyType {
    OpenPopupAction = "OpenPopupAction",
    ShareEntityServiceEndpoint = "ShareEntityServiceEndpoint",
    ShowEngagementPanelEndpoint = "ShowEngagementPanelEndpoint",
    SignalServiceEndpoint = "SignalServiceEndpoint",
}

export interface FluffyMetadata {
    url?:      string;
    pageType?: PageType;
    sendPost?: boolean;
    apiurl?:   Fluffyapiurl;
}

export interface FluffyNextEndpoint {
    type:     EndpointType;
    name:     string;
    payload:  GlobalConfigurationClass;
    metadata: OnSubscribeEndpointMetadata;
}

export interface GlobalConfigurationClass {
    params: string;
}

export interface OpenPopup {
    type:      ActionType;
    popup:     CommandPopup;
    popupType: CommandPopupType;
}

export interface CunningPayload {
    nextEndpoint?:                       TentacledNextEndpoint;
    identifier?:                         Identifier;
    globalConfiguration?:                GlobalConfigurationClass;
    engagementPanelPresentationConfigs?: EngagementPanelPresentationConfigs;
    signal?:                             Signal;
    actions?:                            StickyAction[];
    videoId?:                            string;
    onAddCommand?:                       FluffyOnAddCommand;
    serializedShareEntity?:              string;
    commands?:                           ShareEntityServiceEndpointCommand[];
}

export interface StickyAction {
    addToPlaylistCommand?: AddToPlaylistCommand;
    openPopupAction?:      FluffyOpenPopupAction;
}

export interface AddToPlaylistCommand {
    openMiniplayer:      boolean;
    openListPanel:       boolean;
    videoId:             string;
    listType:            ListType;
    onCreateListCommand: OnCreateListCommand;
    videoIds:            string[];
    videoCommand?:       VideoCommand;
}

export interface OnCreateListCommand {
    clickTrackingParams:           string;
    commandMetadata:               ServiceEndpointCommandMetadata;
    createPlaylistServiceEndpoint: CreatePlaylistServiceEndpointClass;
}

export interface VideoCommand {
    clickTrackingParams: string;
    commandMetadata:     NavigationEndpointCommandMetadata;
    watchEndpoint:       VideoCommandPayload;
}

export interface VideoCommandPayload {
    videoId:                            string;
    watchEndpointSupportedOnesieConfig: WatchEndpointSupportedOnesieConfig;
    playerParams?:                      string;
    nofollow?:                          boolean;
}

export interface FluffyOpenPopupAction {
    popup:     StickyPopup;
    popupType: PurplePopupType;
}

export interface StickyPopup {
    notificationActionRenderer: NotificationActionRenderer;
}

export interface NotificationActionRenderer {
    responseText:   TextClass;
    trackingParams: string;
}

export interface ShareEntityServiceEndpointCommand {
    clickTrackingParams: string;
    openPopupAction:     CommandOpenPopupAction;
}

export interface CommandOpenPopupAction {
    popup:     IndigoPopup;
    popupType: CommandPopupType;
    beReused:  boolean;
}

export interface IndigoPopup {
    unifiedSharePanelRenderer: UnifiedSharePanelRenderer;
}

export interface UnifiedSharePanelRenderer {
    trackingParams:     string;
    showLoadingSpinner: boolean;
}

export interface EngagementPanelPresentationConfigs {
    engagementPanelPopupPresentationConfig: EngagementPanelPopupPresentationConfig;
}

export interface EngagementPanelPopupPresentationConfig {
    popupType: string;
}

export interface Identifier {
    tag: string;
}

export interface TentacledNextEndpoint {
    clickTrackingParams:   string;
    commandMetadata:       ServiceEndpointCommandMetadata;
    getReportFormEndpoint: GlobalConfigurationClass;
}

export interface FluffyOnAddCommand {
    clickTrackingParams:      string;
    getDownloadActionCommand: FluffyGetDownloadActionCommand;
}

export interface FluffyGetDownloadActionCommand {
    videoId: string;
    params:  GetDownloadActionCommandParams;
}

export enum GetDownloadActionCommandParams {
    Caiqaa3D3D = "CAIQAA%3D%3D",
}

export enum Icon {
    AddToQueueTail = "ADD_TO_QUEUE_TAIL",
    Flag = "FLAG",
    Help = "HELP",
    Share = "SHARE",
}

export enum AccessibilityTextEnum {
    AboutProductsAndCommissions = "About products and commissions",
    AddToQueue = "Add to queue",
    Report = "Report",
    ReportListing = "Report listing",
    Share = "Share",
}

export interface TopLevelButtonElement {
    type:                        string;
    likeButton?:                 LikeButton;
    dislikeButton?:              DislikeButton;
    iconType?:                   string;
    shortLikeCount?:             string;
    likeCount?:                  number;
    likeCountEntity?:            LikeCountEntity;
    dynamicLikeCountUpdateData?: DynamicLikeCountUpdateData;
    iconName?:                   Icon;
    tooltip?:                    AccessibilityTextEnum;
    buttonSize?:                 string;
    isFullWidth?:                boolean;
    state?:                      string;
    onTap?:                      StickyOnTap;
    style?:                      string;
    title?:                      AccessibilityTextEnum;
    buttonType?:                 string;
    accessibilityid?:            string;
    accessibilityText?:          AccessibilityTextEnum;
}

export interface DislikeButton {
    type:             string;
    toggleButton:     DislikeButtonToggleButton;
    dislikeEntityKey: string;
}

export interface DislikeButtonToggleButton {
    type:               string;
    defaultButton:      PurpleDefaultButton;
    toggledButton:      ToggledButton;
    isTogglingDisabled: boolean;
}

export interface PurpleDefaultButton {
    type:              string;
    iconName:          string;
    tooltip:           string;
    buttonSize:        string;
    isFullWidth:       boolean;
    onTap:             FluffyOnTap;
    style:             string;
    title:             string;
    buttonType:        string;
    accessibilityid:   string;
    accessibilityText: string;
}

export interface FluffyOnTap {
    type:     EndpointType;
    commands: IndecentCommand[];
    name:     string;
    payload:  BraggadociousPayload;
    metadata: PayloadClass;
}

export interface IndecentCommand {
    type:     EndpointType;
    name:     string;
    payload:  MischievousPayload;
    metadata: PayloadClass;
    modal?:   FluffyModal;
}

export interface FluffyModal {
    type:    string;
    title:   CommentCountClass;
    content: CommentCountClass;
    button:  TentacledButton;
}

export interface TentacledButton {
    type:       string;
    text:       TextEnum;
    style:      string;
    size:       string;
    isDisabled: boolean;
    endpoint:   StickyEndpoint;
}

export interface StickyEndpoint {
    type:         EndpointType;
    name:         OnUnsubscribeEndpointName;
    payload:      FriskyPayload;
    nextEndpoint: StickyNextEndpoint;
    metadata:     PurpleMetadata;
}

export interface StickyNextEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     string;
    payload:  MagentaPayload;
    metadata: OnSubscribeEndpointMetadata;
}

export interface MagentaPayload {
    status:        string;
    target:        TargetClass;
    dislikeParams: string;
}

export interface TargetClass {
    videoId: Id;
}

export interface FriskyPayload {
    nextEndpoint: IndigoNextEndpoint;
    idamTag:      string;
}

export interface IndigoNextEndpoint {
    clickTrackingParams: string;
    commandMetadata:     ServiceEndpointCommandMetadata;
    likeEndpoint:        MagentaPayload;
}

export interface MischievousPayload {
    gestureType?:    string;
    trackingParams?: string;
    modal?:          TentacledModal;
}

export interface TentacledModal {
    modalWithTitleAndButtonRenderer: FluffyModalWithTitleAndButtonRenderer;
}

export interface FluffyModalWithTitleAndButtonRenderer {
    title:   TextClass;
    content: TextClass;
    button:  StickyButton;
}

export interface StickyButton {
    buttonRenderer: FluffyButtonRenderer;
}

export interface FluffyButtonRenderer {
    style:              string;
    size:               string;
    isDisabled:         boolean;
    text:               TextClass;
    navigationEndpoint: FluffyNavigationEndpoint;
    trackingParams:     string;
}

export interface FluffyNavigationEndpoint {
    clickTrackingParams: string;
    commandMetadata:     NavigationEndpointCommandMetadata;
    signInEndpoint:      FriskyPayload;
}

export interface BraggadociousPayload {
    commands: HilariousCommand[];
}

export interface HilariousCommand {
    logGestureCommand?: LogGestureCommand;
    innertubeCommand?:  FluffyInnertubeCommand;
}

export interface FluffyInnertubeCommand {
    clickTrackingParams: string;
    commandMetadata:     PurpleCommandMetadata;
    modalEndpoint:       FluffyModalEndpoint;
}

export interface FluffyModalEndpoint {
    modal: TentacledModal;
}

export interface ToggledButton {
    type:              string;
    iconName:          string;
    tooltip:           string;
    buttonSize:        string;
    isFullWidth:       boolean;
    onTap:             ToggledButtonOnTap;
    style:             string;
    title:             string;
    buttonType:        string;
    accessibilityid:   string;
    accessibilityText: string;
}

export interface ToggledButtonOnTap {
    type:     EndpointType;
    commands: AmbitiousCommand[];
    name:     string;
    payload:  Payload2;
    metadata: PayloadClass;
}

export interface AmbitiousCommand {
    type:     EndpointType;
    name:     string;
    payload:  Payload1;
    metadata: OnSubscribeEndpointMetadata;
    command?: OnSubscribeEndpointCommand;
}

export interface Payload1 {
    gestureType?:      string;
    trackingParams?:   string;
    status?:           string;
    target?:           TargetClass;
    removeLikeParams?: string;
}

export interface Payload2 {
    commands: CunningCommand[];
}

export interface CunningCommand {
    logGestureCommand?: LogGestureCommand;
    innertubeCommand?:  TentacledInnertubeCommand;
}

export interface TentacledInnertubeCommand {
    clickTrackingParams: string;
    commandMetadata:     ServiceEndpointCommandMetadata;
    likeEndpoint:        LikeEndpoint;
}

export interface LikeEndpoint {
    status:           string;
    target:           TargetClass;
    removeLikeParams: string;
}

export interface DynamicLikeCountUpdateData {
    updateStatusKey:               string;
    placeholderLikeCountValuesKey: string;
    updateDelayLoopid:             string;
    updateDelaysec:                number;
}

export interface LikeButton {
    type:                string;
    toggleButton:        LikeButtonToggleButton;
    likeStatusEntityKey: string;
    likeStatusEntity:    LikeStatusEntity;
}

export interface LikeStatusEntity {
    key:        string;
    likeStatus: string;
}

export interface LikeButtonToggleButton {
    type:               string;
    defaultButton:      FluffyDefaultButton;
    toggledButton:      ToggledButton;
    isTogglingDisabled: boolean;
    identifier:         string;
}

export interface FluffyDefaultButton {
    type:              string;
    iconName:          string;
    tooltip:           string;
    buttonSize:        string;
    isFullWidth:       boolean;
    onTap:             TentacledOnTap;
    style:             string;
    title:             string;
    buttonType:        string;
    accessibilityid:   string;
    accessibilityText: string;
}

export interface TentacledOnTap {
    type:     EndpointType;
    commands: MagentaCommand[];
    name:     string;
    payload:  Payload6;
    metadata: PayloadClass;
}

export interface MagentaCommand {
    type:     EndpointType;
    name:     string;
    payload:  Payload5;
    metadata: PayloadClass;
    modal?:   StickyModal;
}

export interface StickyModal {
    type:    string;
    title:   CommentCountClass;
    content: CommentCountClass;
    button:  IndigoButton;
}

export interface IndigoButton {
    type:       string;
    text:       TextEnum;
    style:      string;
    size:       string;
    isDisabled: boolean;
    endpoint:   IndigoEndpoint;
}

export interface IndigoEndpoint {
    type:         EndpointType;
    name:         OnUnsubscribeEndpointName;
    payload:      Payload4;
    nextEndpoint: IndecentNextEndpoint;
    metadata:     PurpleMetadata;
}

export interface IndecentNextEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     string;
    payload:  Payload3;
    metadata: OnSubscribeEndpointMetadata;
}

export interface Payload3 {
    status:     string;
    target:     TargetClass;
    likeParams: string;
}

export interface Payload4 {
    nextEndpoint: HilariousNextEndpoint;
    idamTag:      string;
}

export interface HilariousNextEndpoint {
    clickTrackingParams: string;
    commandMetadata:     ServiceEndpointCommandMetadata;
    likeEndpoint:        Payload3;
}

export interface Payload5 {
    gestureType?:    string;
    trackingParams?: string;
    modal?:          IndigoModal;
}

export interface IndigoModal {
    modalWithTitleAndButtonRenderer: TentacledModalWithTitleAndButtonRenderer;
}

export interface TentacledModalWithTitleAndButtonRenderer {
    title:   TextClass;
    content: TextClass;
    button:  IndecentButton;
}

export interface IndecentButton {
    buttonRenderer: TentacledButtonRenderer;
}

export interface TentacledButtonRenderer {
    style:              string;
    size:               string;
    isDisabled:         boolean;
    text:               TextClass;
    navigationEndpoint: TentacledNavigationEndpoint;
    trackingParams:     string;
}

export interface TentacledNavigationEndpoint {
    clickTrackingParams: string;
    commandMetadata:     NavigationEndpointCommandMetadata;
    signInEndpoint:      Payload4;
}

export interface Payload6 {
    commands: FriskyCommand[];
}

export interface FriskyCommand {
    logGestureCommand?: LogGestureCommand;
    innertubeCommand?:  StickyInnertubeCommand;
}

export interface StickyInnertubeCommand {
    clickTrackingParams: string;
    commandMetadata:     PurpleCommandMetadata;
    modalEndpoint:       TentacledModalEndpoint;
}

export interface TentacledModalEndpoint {
    modal: IndigoModal;
}

export interface LikeCountEntity {
    key: string;
}

export interface StickyOnTap {
    type:     EndpointType;
    commands: MischievousCommand[];
    name:     string;
    payload:  Payload8;
    metadata: PayloadClass;
}

export interface MischievousCommand {
    type:     EndpointType;
    name:     string;
    payload:  Payload7;
    metadata: OnSubscribeEndpointMetadata;
    command?: OnSubscribeEndpointCommand;
}

export interface Payload7 {
    gestureType?:           string;
    trackingParams?:        string;
    serializedShareEntity?: string;
    commands?:              ShareEntityServiceEndpointCommand[];
}

export interface Payload8 {
    commands: BraggadociousCommand[];
}

export interface BraggadociousCommand {
    logGestureCommand?: LogGestureCommand;
    innertubeCommand?:  IndigoInnertubeCommand;
}

export interface IndigoInnertubeCommand {
    clickTrackingParams:        string;
    commandMetadata:            ServiceEndpointCommandMetadata;
    shareEntityServiceEndpoint: ShareEntityServiceEndpointClass;
}

export interface ShareEntityServiceEndpointClass {
    serializedShareEntity: string;
    commands:              ShareEntityServiceEndpointCommand[];
}

export enum MenuType {
    Menu = "Menu",
}

export interface PlayabilityStatus {
    status:               string;
    reason:               string;
    embeddable:           boolean;
    audioOnlyPlayability: null;
    errorScreen:          null;
}

export interface PlayerConfig {
    audioConfig:           AudioConfig;
    streamSelectionConfig: StreamSelectionConfig;
    mediaCommonConfig:     MediaCommonConfig;
}

export interface AudioConfig {
    loudnessdb:              number;
    perceptualLoudnessdb:    number;
    enablePerFormatLoudness: boolean;
}

export interface MediaCommonConfig {
    dynamicReadaheadConfig:      DynamicReadaheadConfig;
    mediaUstreamerRequestConfig: MediaUstreamerRequestConfig;
}

export interface DynamicReadaheadConfig {
    maxReadAheadMediaTimems: number;
    minReadAheadMediaTimems: number;
    readAheadGrowthRatems:   number;
}

export interface MediaUstreamerRequestConfig {
    videoPlaybackUstreamerConfig: string;
}

export interface StreamSelectionConfig {
    maxBitrate: string;
}

export interface PlayerOverlays {
    type:                 string;
    endScreen:            EndScreen;
    autoplay:             PlayerOverlaysAutoplay;
    shareButton:          ShareButton;
    addToMenu:            Menu;
    fullscreenEngagement: null;
    actions:              any[];
    browserMediaSession:  null;
    decoratedPlayerBar:   null;
    videoDetails:         VideoDetails;
}

export interface PlayerOverlaysAutoplay {
    type:                       string;
    title:                      CommentCountClass;
    videoid:                    string;
    videoTitle:                 RelativeDate;
    shortViewCount:             RelativeDate;
    preferImmediateRedirect:    boolean;
    countDownSecsForFullscreen: number;
    published:                  CommentCountClass;
    background:                 Thumbnail[];
    thumbnailOverlays:          AutoplayThumbnailOverlay[];
    author:                     AutoplayAuthor;
    cancelButton:               CancelButton;
    nextButton:                 NextButton;
    closeButton:                CloseButtonClass;
}

export interface AutoplayAuthor {
    id:         string;
    name:       string;
    thumbnails: any[];
    endpoint:   AuthorEndpoint;
    badges:     any[];
    url:        string;
}

export interface AuthorEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     PurpleName;
    payload:  Payload9;
    metadata: AutoplayVideoMetadata;
}

export interface Payload9 {
    browseId:         string;
    canonicalBaseUrl: string;
}

export interface CancelButton {
    type:          string;
    text:          string;
    label:         string;
    accessibility: MenuAccessibility;
    style:         string;
    size:          string;
    isDisabled:    boolean;
    endpoint:      IndecentEndpoint;
}

export interface IndecentEndpoint {
    type:     EndpointType;
    name:     string;
    payload:  Payload10;
    metadata: OnSubscribeEndpointMetadata;
}

export interface Payload10 {
    endpoint: PayloadEndpoint;
    action:   string;
}

export interface PayloadEndpoint {
    watch: Watch;
}

export interface Watch {
    hack: boolean;
}

export interface NextButton {
    type:          string;
    label:         string;
    accessibility: MenuAccessibility;
    style:         string;
    size:          string;
    isDisabled:    boolean;
    endpoint:      NextEndpointClass;
}

export interface RelativeDate {
    text:          string;
    accessibility: MenuAccessibility;
    rtl:           boolean;
}

export interface AutoplayThumbnailOverlay {
    type:   ThumbnailOverlayType;
    text:   string;
    style?: ThumbnailOverlayStyle;
}

export enum ThumbnailOverlayStyle {
    Default = "DEFAULT",
}

export enum ThumbnailOverlayType {
    ThumbnailOverlayNowPlaying = "ThumbnailOverlayNowPlaying",
    ThumbnailOverlayTimeStatus = "ThumbnailOverlayTimeStatus",
    ThumbnailOverlayToggleButton = "ThumbnailOverlayToggleButton",
}

export interface EndScreen {
    type:    string;
    results: Result[];
    title:   string;
}

export interface Result {
    type:              ResultType;
    id:                string;
    title:             RelativeDate;
    thumbnails:        Thumbnail[];
    thumbnailOverlays: AutoplayThumbnailOverlay[];
    author:            AutoplayAuthor;
    endpoint:          ResultEndpoint;
    shortViewCount:    RelativeDate;
    badges:            any[];
    duration:          Duration;
}

export interface Duration {
    text:    string;
    seconds: number;
}

export interface ResultEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     AutoplayVideoName;
    payload:  VideoCommandPayload;
    metadata: AutoplayVideoMetadata;
}

export enum ResultType {
    EndScreenVideo = "EndScreenVideo",
}

export interface ShareButton {
    type:       string;
    tooltip:    AccessibilityTextEnum;
    style:      string;
    size:       string;
    iconType:   Icon;
    isDisabled: boolean;
    endpoint:   ShareButtonEndpoint;
}

export interface ShareButtonEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     OnUnsubscribeEndpointName;
    payload:  ShareEntityServiceEndpointClass;
    metadata: OnSubscribeEndpointMetadata;
}

export interface VideoDetails {
    type:     string;
    title:    CommentCountClass;
    subtitle: HeaderElement;
}

export interface PrimaryInfo {
    type:           string;
    title:          HeaderElement;
    superTitleLink: SuperTitleLink;
    viewCount:      ViewCount;
    badges:         any[];
    published:      CommentCountClass;
    relativeDate:   RelativeDate;
    menu:           Menu;
}

export interface SuperTitleLink {
    runs:     HeaderRun[];
    text:     string;
    rtl:      boolean;
    endpoint: SuperTitleLinkEndpoint;
}

export interface SuperTitleLinkEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     PurpleName;
    payload:  Payload11;
    metadata: AutoplayVideoMetadata;
}

export interface Payload11 {
    browseId: string;
    params:   string;
}

export interface ViewCount {
    type:                string;
    originalViewCount:   string;
    shortViewCount:      CommentCountClass;
    extraShortViewCount: ExtraShortViewCount;
    viewCount:           CommentCountClass;
}

export interface SecondaryInfo {
    type:                      string;
    owner:                     Owner;
    description:               HeaderElement;
    subscribeButton:           SubscribeButton;
    metadata:                  SecondaryInfoMetadata;
    showMoreText:              CommentCountClass;
    showLessText:              CommentCountClass;
    defaultExpanded:           boolean;
    descriptionCollapsedLines: number;
}

export interface SecondaryInfoMetadata {
    type:               string;
    rows:               any[];
    collapsedItemCount: number;
}

export interface Owner {
    type:               string;
    subscriptionButton: SubscriptionButton;
    subscriberCount:    RelativeDate;
    author:             OwnerAuthor;
}

export interface OwnerAuthor {
    id:                string;
    name:              string;
    thumbnails:        Thumbnail[];
    endpoint:          AuthorEndpoint;
    badges:            AuthorBadge[];
    isModerator?:      boolean;
    isVerified?:       boolean;
    isVerifiedArtist?: boolean;
    url:               string;
}

export interface AuthorBadge {
    type:     BadgeType;
    iconType: IconTypeEnum;
    style:    PurpleStyle;
    tooltip:  BadgeTooltip;
}

export enum IconTypeEnum {
    CheckCircleThick = "CHECK_CIRCLE_THICK",
}

export enum PurpleStyle {
    BadgeStyleTypeVerified = "BADGE_STYLE_TYPE_VERIFIED",
}

export enum BadgeTooltip {
    Verified = "Verified",
}

export enum BadgeType {
    MetadataBadge = "MetadataBadge",
}

export interface SubscriptionButton {
    text: ExtraShortViewCount;
}

export interface Storyboards {
    type:   string;
    boards: Board[];
}

export interface Board {
    type:            string;
    templateurl:     string;
    thumbnailWidth:  number;
    thumbnailHeight: number;
    thumbnailCount:  number;
    interval:        number;
    columns:         number;
    rows:            number;
    storyboardCount: number;
}

export interface StreamingData {
    expires:               Date;
    formats:               Format[];
    adaptiveFormats:       Format[];
    serverabrStreamingurl: string;
}

export interface Format {
    itag:             number;
    mimeType:         string;
    isTypeOtf:        boolean;
    bitrate:          number;
    averageBitrate:   number;
    width?:           number;
    height?:          number;
    projectionType:   ProjectionType;
    initRange?:       Range;
    indexRange?:      Range;
    lastModified:     Date;
    lastModifiedms:   string;
    contentLength:    number;
    quality:          Quality;
    qualityLabel?:    string;
    fps?:             number;
    approxDurationms: number;
    hasAudio:         boolean;
    hasVideo:         boolean;
    hasText:          boolean;
    colorInfo?:       ColorInfo;
    highReplication?: boolean;
    audioQuality?:    AudioQuality;
    audioSampleRate?: number;
    audioChannels?:   number;
    loudnessdb?:      number;
    language?:        null | string;
    isDrc?:           boolean;
    isDubbed?:        boolean;
    isDescriptive?:   boolean;
    isSecondary?:     boolean;
    isAutoDubbed?:    boolean;
    isOriginal?:      boolean;
    xtags?:           string;
    audioTrack?:      AdaptiveFormatAudioTrack;
    url?:             string;
}

export enum AudioQuality {
    AudioQualityLow = "AUDIO_QUALITY_LOW",
    AudioQualityMedium = "AUDIO_QUALITY_MEDIUM",
}

export interface AdaptiveFormatAudioTrack {
    audioIsDefault: boolean;
    displayName:    string;
    id:             string;
}

export interface ColorInfo {
    primaries:               MatrixCoefficients;
    transferCharacteristics: MatrixCoefficients;
    matrixCoefficients:      MatrixCoefficients;
}

export enum MatrixCoefficients {
    Bt709 = "BT709",
}

export interface Range {
    start: number;
    end:   number;
}

export enum ProjectionType {
    Rectangular = "RECTANGULAR",
}

export enum Quality {
    Hd1080 = "hd1080",
    Hd720 = "hd720",
    Large = "large",
    Medium = "medium",
    Small = "small",
    Tiny = "tiny",
}

export interface WatchNextFeed {
    type:              WatchNextFeedType;
    videoid:           string;
    thumbnails:        Thumbnail[];
    title:             RelativeDate;
    author:            OwnerAuthor;
    isWatched:         boolean;
    thumbnailOverlays: WatchNextFeedThumbnailOverlay[];
    menu:              Menu;
    badges:            WatchNextFeedBadge[];
    published:         CommentCountClass;
    viewCount:         CommentCountClass;
    shortViewCount:    RelativeDate;
    richThumbnail:     Thumbnail[];
    shortBylineText:   BylineText;
    longBylineText:    BylineText;
    lengthText:        RelativeDate;
    endpoint:          ResultEndpoint;
}

export interface WatchNextFeedBadge {
    type:  BadgeType;
    style: FluffyStyle;
    label: Label;
}

export enum Label {
    New = "New",
}

export enum FluffyStyle {
    BadgeStyleTypeSimple = "BADGE_STYLE_TYPE_SIMPLE",
}

export interface BylineText {
    runs:     HeaderRun[];
    text:     string;
    rtl:      boolean;
    endpoint: AuthorEndpoint;
}

export interface WatchNextFeedThumbnailOverlay {
    type:               ThumbnailOverlayType;
    text?:              string;
    style?:             ThumbnailOverlayStyle;
    isToggled?:         boolean;
    iconType?:          IconTypeClass;
    tooltip?:           IconTypeClass;
    toggledEndpoint?:   ToggledEndpoint;
    untoggledEndpoint?: UntoggledEndpoint;
}

export interface IconTypeClass {
    toggled:   Toggled;
    untoggled: Untoggled;
}

export enum Toggled {
    Added = "Added",
    Check = "CHECK",
    PlaylistAddCheck = "PLAYLIST_ADD_CHECK",
}

export enum Untoggled {
    AddToQueue = "Add to queue",
    AddToQueueTail = "ADD_TO_QUEUE_TAIL",
    UntoggledWatchLater = "Watch later",
    WatchLater = "WATCH_LATER",
}

export interface ToggledEndpoint {
    type:     EndpointType;
    command:  OnSubscribeEndpointCommand;
    name:     ToggledEndpointName;
    payload:  ToggledEndpointPayload;
    metadata: OnSubscribeEndpointMetadata;
}

export enum ToggledEndpointName {
    PlaylistEditEndpoint = "playlistEditEndpoint",
    SignalServiceEndpoint = "signalServiceEndpoint",
}

export interface ToggledEndpointPayload {
    playlistId: PlaylistId;
    actions:    IndigoAction[];
}

export interface IndigoAction {
    action:         HilariousAction;
    removedVideoId: string;
}

export enum HilariousAction {
    ActionRemoveVideoByVideoID = "ACTION_REMOVE_VIDEO_BY_VIDEO_ID",
}

export enum PlaylistId {
    Wl = "WL",
}

export interface UntoggledEndpoint {
    type:     EndpointType;
    command:  UntoggledEndpointCommand;
    name:     ToggledEndpointName;
    payload:  UntoggledEndpointPayload;
    metadata: OnSubscribeEndpointMetadata;
}

export interface UntoggledEndpointCommand {
    type:     TentacledType;
    actions?: TentacledAction[];
    signal?:  Signal;
}

export enum TentacledType {
    PlaylistEditEndpoint = "PlaylistEditEndpoint",
    SignalServiceEndpoint = "SignalServiceEndpoint",
}

export interface UntoggledEndpointPayload {
    playlistId?: PlaylistId;
    actions:     IndecentAction[];
    signal?:     Signal;
}

export interface IndecentAction {
    addedVideoId?:         string;
    action?:               AmbitiousAction;
    addToPlaylistCommand?: AddToPlaylistCommand;
}

export enum AmbitiousAction {
    ActionAddVideo = "ACTION_ADD_VIDEO",
}

export enum WatchNextFeedType {
    CompactVideo = "CompactVideo",
}
